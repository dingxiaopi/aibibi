import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { workerScript } from "./helpers/worker";
import { withVisibility } from "../src/services/catalog";
import { filterShops } from "../web/lib/shop-directory";
import { parseFavorites } from "../web/lib/favorites";
import type { Shop } from "../shared/api-types";
let mf: Miniflare,
  db: Awaited<ReturnType<Miniflare["getD1Database"]>>,
  cookie = "";
const at = new Date().toISOString();
const stored = {
  id: "S123:G1",
  source_goods_id: "G1",
  shop_id: "S123",
  sku: "plus-ios",
  item_name: "Plus月卡",
  item_url: "https://www.16688.com.cn/goods/G1",
  price: 99,
  checked_at: at,
  currency: "CNY",
  collection_status: "ok",
  listing_status: "listed",
  stock_status: "in_stock",
  stock_count: 1,
  availability: "ready",
};
async function call(
  path: string,
  body?: unknown,
  options: { admin?: boolean; origin?: string; ip?: string } = {},
) {
  return mf.dispatchFetch("http://reports.test" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: options.origin || "http://reports.test",
      "CF-Connecting-IP": options.ip || "192.0.2.1",
      ...(options.admin ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
before(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: await workerScript(),
      compatibilityDate: "2026-10-13",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "reports" },
      bindings: {
        ADMIN_PASSWORD: "test-reports-password",
        PUBLIC_SITE: "true",
      },
      serviceBindings: {
        ASSETS: async () => new Response("<html><title>test</title></html>"),
      },
      outboundService: async () => {
        throw Error("No external traffic");
      },
    }),
  );
  await mf.ready;
  db = await mf.getD1Database("DB");
  for (const file of readdirSync(new URL("../migrations/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(
      new URL("../migrations/" + file, import.meta.url),
      "utf8",
    );
    await db.exec(sql.replace(/^--.*$/gm, "").replace(/\n/g, " "));
  }
  await db
    .prepare("INSERT INTO products VALUES('plus-ios','gpt',?)")
    .bind(
      JSON.stringify({
        id: "plus-ios",
        category: "gpt",
        name: "Plus",
        spec: "30天",
        channel: "iOS",
      }),
    )
    .run();
  await db
    .prepare(
      "INSERT INTO shops(id,platform,name,url,data,checked_at) VALUES('S123','16688','测试店','https://www.16688.com.cn/shop/S123','{}',?)",
    )
    .bind(at)
    .run();
  for (const id of ["G1", "G2"])
    await db
      .prepare("INSERT INTO quotes VALUES(?,'S123','plus-ios',?)")
      .bind(
        "S123:" + id,
        JSON.stringify({ ...stored, id: "S123:" + id, source_goods_id: id }),
      )
      .run();
  const login = await call("/api/admin/login", {
    password: "test-reports-password",
  });
  cookie = login.headers.get("Set-Cookie")!.split(";")[0];
});
beforeEach(async () => {
  await db.exec("DELETE FROM quote_reports; DELETE FROM rate_limits;");
});
after(async () => {
  await mf?.dispose();
});

test("feedback stores authoritative quote context and admin processing never edits prices", async () => {
  const response = await call("/api/quote-reports", {
    quote_id: stored.id,
    reason: "price",
    note: "原店涨价",
    price: 1,
    item_url: "https://untrusted.test",
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const list = await call("/api/admin/quote-reports", undefined, {
    admin: true,
  });
  const data = (await list.json()) as {
    reports: { id: string; snapshot: string }[];
  };
  assert.equal(data.reports.length, 1);
  const snapshot = JSON.parse(data.reports[0].snapshot);
  assert.equal(snapshot.price, 99);
  assert.equal(snapshot.item_url, stored.item_url);
  assert.equal(
    (
      await call(
        "/api/admin/quote-reports",
        { id: data.reports[0].id, status: "resolved" },
        { admin: true },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT status FROM quote_reports")
        .first<{ status: string }>()
    )?.status,
    "resolved",
  );
  assert.equal(
    (
      await db
        .prepare("SELECT data FROM quotes WHERE id=?")
        .bind(stored.id)
        .first<{ data: string }>()
    )?.data,
    JSON.stringify(stored),
  );
});

test("feedback deduplicates same-day reports and enforces an independent atomic five-report budget", async () => {
  const body = { quote_id: stored.id, reason: "price" };
  assert.equal((await call("/api/quote-reports", body)).status, 201);
  const duplicate = await call("/api/quote-reports", body);
  assert.equal(
    ((await duplicate.json()) as { duplicate: boolean }).duplicate,
    true,
  );
  for (const reason of ["stock", "spec", "link", "other"])
    assert.equal(
      (await call("/api/quote-reports", { ...body, reason, note: "说明" }))
        .status,
      201,
    );
  assert.equal(
    (await call("/api/quote-reports", { quote_id: "S123:G2", reason: "price" }))
      .status,
    429,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM quote_reports")
        .first<{ n: number }>()
    )?.n,
    5,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM login_limits")
        .first<{ n: number }>()
    )?.n,
    0,
  );
});

test("feedback rejects unknown quotes, invalid bodies and cross-origin writes; admin records stay private", async () => {
  assert.equal(
    (
      await call(
        "/api/quote-reports",
        { quote_id: stored.id, reason: "price" },
        { origin: "https://foreign.test" },
      )
    ).status,
    403,
  );
  assert.equal(
    (await call("/api/quote-reports", { quote_id: "missing", reason: "price" }))
      .status,
    404,
  );
  assert.equal(
    (await call("/api/quote-reports", { quote_id: stored.id, reason: "bad" }))
      .status,
    400,
  );
  assert.equal(
    (await call("/api/quote-reports", { quote_id: stored.id, reason: "other" }))
      .status,
    400,
  );
  assert.equal(
    (
      await call("/api/quote-reports", {
        quote_id: stored.id,
        reason: "price",
        note: "x".repeat(1001),
      })
    ).status,
    400,
  );
  assert.equal((await call("/api/admin/quote-reports")).status, 401);
  assert.equal(
    (
      await call(
        "/api/admin/quote-reports",
        { id: "id", status: "resolved" },
        { admin: true, origin: "https://foreign.test" },
      )
    ).status,
    403,
  );
});

test("concurrent feedback cannot exceed the five-report budget", async () => {
  const responses = await Promise.all(
    ["price", "stock", "spec"].flatMap((reason) =>
      ["G1", "G2"].map((id) =>
        call(
          "/api/quote-reports",
          { quote_id: "S123:" + id, reason },
          { ip: "192.0.2.99" },
        ),
      ),
    ),
  );
  assert.equal(responses.filter((r) => r.status === 201).length, 5);
  assert.equal(responses.filter((r) => r.status === 429).length, 1);
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM quote_reports")
        .first<{ n: number }>()
    )?.n,
    5,
  );
});

test("shop brands derive from eligible quote SKUs and filters combine without changing shop data", async () => {
  const response = await call("/api/shops");
  const data = (await response.json()) as { shops: Shop[] };
  assert.deepEqual(data.shops[0].categories, ["gpt"]);
  const shops = withVisibility(
    [
      {
        id: "a",
        name: "甲",
        platform: "wzyp",
        enabled: true,
        collection_status: "ok",
        checked_at: at,
      } as Shop,
      {
        id: "b",
        name: "乙",
        platform: "acg",
        enabled: true,
        collection_status: "ok",
        checked_at: "2020-01-01",
      } as Shop,
      {
        id: "c",
        name: "丙",
        platform: "wzyp",
        enabled: false,
        collection_status: "ok",
        checked_at: at,
      } as Shop,
    ],
    [
      { shop_id: "a", sku: "plus" },
      { shop_id: "c", sku: "claude" },
    ],
    new Map([
      ["plus", "gpt"],
      ["claude", "claude"],
    ]),
  );
  const original = JSON.stringify(shops);
  const filters = {
    q: "链动",
    platform: "wzyp",
    category: "gpt",
    ready: true,
    saved: true,
    favorites: ["a", "c"],
    sort: "updated",
  };
  assert.deepEqual(
    filterShops(shops, filters).map((s) => s.id),
    ["a"],
  );
  assert.deepEqual(filterShops(shops, { ...filters, category: "claude" }), []);
  assert.equal(JSON.stringify(shops), original);
});

test("favorites tolerate corrupted storage and favorites page is excluded from indexing", async () => {
  assert.deepEqual(parseFavorites("bad").products, []);
  assert.deepEqual(
    parseFavorites(
      JSON.stringify({
        products: ["plus", "plus", "../bad"],
        shops: [null, "A_shop"],
      }),
    ),
    { products: ["plus"], shops: ["A_shop"], persistent: true },
  );
  const r = await call("/favorites");
  assert.equal(r.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal(r.headers.get("Cache-Control"), "private, no-store");
});

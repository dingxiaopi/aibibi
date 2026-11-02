import { workerScript } from "./helpers/worker";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { coverageRows, quoteHealth, candidateTerms } from "../src/operations";
import { transferPlan, pushBundle } from "../shared/transfer-plan.mjs";
import { fingerprint } from "../src/domain";
let mf: Miniflare,
  db: Awaited<ReturnType<Miniflare["getD1Database"]>>,
  cookie = "";
const token = "test-only-operations-collector-token";
const password = "test-only-operations-password";
const at = new Date().toISOString();
const product = {
  id: "plus-ios",
  category: "gpt",
  name: "Plus 月付直充",
  spec: "30天 iOS",
  channel: "iOS",
};
const shop = {
  id: "S123",
  name: "测试店",
  platform: "16688",
  url: "https://www.16688.com.cn/shop/S123",
  collection_status: "ok",
  checked_at: at,
  source_item_count: 2,
};
const raw = {
  goods_no: "G1",
  shop_no: shop.id,
  name: "ChatGPT Plus",
  description: "30天iOS直充",
};
let fp = "";
const quote = (gid = "G1") => ({
  id: `${shop.id}:${gid}`,
  source_goods_id: gid,
  shop_id: shop.id,
  sku: product.id,
  item_name: raw.name,
  price: 100,
  currency: "CNY",
  item_url: "https://www.16688.com.cn/goods/" + gid,
  checked_at: at,
  collection_status: "ok",
  listing_status: "listed",
  stock_status: "in_stock",
  stock_count: 3,
  availability: "ready",
});
async function call(
  path: string,
  value?: unknown,
  auth: "none" | "collector" | "admin" = "collector",
  foreign = false,
) {
  return mf.dispatchFetch("http://ops.test" + path, {
    method: value ? "POST" : "GET",
    headers: {
      ...(value
        ? {
            "Content-Type": "application/json",
            Origin: foreign ? "http://foreign.test" : "http://ops.test",
          }
        : {}),
      ...(auth === "collector"
        ? { Authorization: "Bearer " + token }
        : auth === "admin"
          ? { Cookie: cookie }
          : {}),
    },
    body: value ? JSON.stringify(value) : undefined,
  });
}
const emptyBundle = () => ({
  schema_version: 1,
  generated_at: at,
  shops: [],
  quotes: [],
  review_items: [],
  mapping_fingerprints: {},
  product_definitions: [product],
});
async function send(
  kind: "transfers" | "ingest",
  payload: Record<string, any>,
) {
  const r = await call(
    kind === "transfers" ? "/api/collector/transfers" : "/api/ingest",
    payload,
  );
  const data = (await r.json()) as Record<string, any>;
  if (!r.ok) throw Error(data.error);
  return data;
}
before(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: await workerScript(),
      compatibilityDate: "2026-10-13",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "ops" },
      bindings: {
        ADMIN_PASSWORD: password,
        PUBLIC_SITE: "true",
        COLLECTOR_INGEST_TOKEN: token,
      },
      outboundService: async () => {
        throw Error("No storefront requests expected");
      },
    }),
  );
  await mf.ready;
  db = await mf.getD1Database("DB");
  for (const file of [
    "0001_initial.sql",
    "0002_idempotent_shop_import.sql",
    "0003_external_collection.sql",
    "0005_shop_capacity_60.sql",
    "0006_local_transfers.sql",
  ])
    if (file === "0006_local_transfers.sql") {
      const sql = readFileSync("migrations/" + file, "utf8").replace(
        /^--.*$/gm,
        "",
      );
      for (const statement of sql.split(";").filter((x) => x.trim()))
        await db.prepare(statement).run();
    } else await db.exec(readFileSync("migrations/" + file, "utf8"));
  const login = await call("/api/admin/login", { password }, "none");
  cookie = login.headers.get("Set-Cookie")!.split(";")[0];
  fp = await fingerprint(raw);
});
after(async () => {
  await mf?.dispose();
});

test("coverage shares minimum eligibility and deduplicates stores; unhealthy observations stay visible as reasons", () => {
  const base = { ...quote(), enabled: 1, shop_name: "店一", platform: "16688" };
  const old = new Date(Date.now() - 49 * 3600000).toISOString();
  const qs = [
    base,
    { ...base, id: "duplicate", price: 101 },
    { ...base, shop_id: "paused", enabled: 0, price: 1 },
    { ...base, shop_id: "old-stock", inventory_checked_at: old },
    { ...base, shop_id: "failed", collection_status: "failed" },
    { ...base, shop_id: "review", collection_status: "needs_review" },
    { ...base, shop_id: "out", stock_status: "out", availability: "unknown" },
    { ...base, shop_id: "delayed", availability: "delayed" },
  ];
  const rows = coverageRows([product, { id: "no-quotes" }], qs, 48);
  assert.equal(rows[0].gap, "single");
  assert.equal(rows[0].min_price, 100);
  assert.equal(rows[0].ready_shop_count, 1);
  assert.equal(rows[0].blockers.expired, 1);
  assert.equal(rows[0].blockers.paused, 1);
  assert.equal(rows[0].blockers.review, 1);
  assert.equal(rows[0].blockers.delayed, 1);
  assert.equal(rows[1].gap, "empty");
  const health = quoteHealth(
    [
      {
        ...base,
        inventory_checked_at: new Date(Date.now() - 40 * 3600000).toISOString(),
      },
      { ...base, enabled: 0, checked_at: old },
    ],
    48,
  );
  assert.equal(health.expiring, 1);
  assert.equal(health.expired, 0);
  assert.deepEqual(
    candidateTerms({ category: "other", brand: "api", name: "小蓝 API · 月卡" })
      .brands,
    ["小蓝"],
  );
  assert.ok(
    !candidateTerms({
      category: "other",
      brand: "x",
      name: "X Premium",
    }).brands.includes("x"),
  );
});

test("workbench, candidate records and transfer registration require the correct credentials and CSRF boundary", async () => {
  for (const path of [
    "/api/admin/coverage",
    "/api/admin/coverage/candidates?sku=plus-ios",
    "/api/admin/collection-status",
    "/api/admin/reviews?id=S123:G1",
  ])
    assert.equal((await call(path, undefined, "none")).status, 401);
  const { registration, batches } = await transferPlan(emptyBundle());
  assert.equal(
    (await call("/api/collector/transfers", registration, "none")).status,
    401,
  );
  assert.equal(
    (await call("/api/admin/transfers", registration, "admin", true)).status,
    403,
  );
  assert.equal(
    (await call("/api/admin/ingest", batches[0], "admin", true)).status,
    403,
  );
  assert.equal(
    (
      await call("/api/collector/transfers", {
        ...registration,
        id: "a".repeat(64),
      })
    ).status,
    400,
  );
  assert.equal(
    (await call("/api/collector/transfers", registration)).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/api/ingest",
        { ...batches[0], transfer: { id: registration.id, index: 0 } },
        "none",
      )
    ).status,
    401,
  );
});

test("plans reject changed content and out-of-order batches; browser import supports new product and mapping definitions", async () => {
  const mapping = {
    shop_id: shop.id,
    sku: product.id,
    accepted_fingerprint: fp,
    channel: "iOS",
    warranty: "商家声明",
    spec_evidence: "30天iOS直充",
    restriction: "账号条件",
  };
  const bundle = {
    ...emptyBundle(),
    transfer_format: 2,
    shops: [shop],
    quotes: [quote()],
    mapping_fingerprints: { "S123:G1": fp },
    mapping_updates: [
      {
        shop_id: shop.id,
        goods_id: "G1",
        previous_fingerprint: null,
        reviewed_at: at,
        raw,
        mapping,
      },
    ],
  };
  const { registration, batches } = await transferPlan(bundle);
  await send("transfers", registration);
  const tampered = {
    ...batches[0],
    product_definitions: [{ ...product, name: "改了名字" }],
    transfer: { id: registration.id, index: 0 },
  };
  assert.equal((await call("/api/ingest", tampered)).status, 409);
  assert.equal(
    (
      await call("/api/ingest", {
        ...batches[1],
        transfer: { id: registration.id, index: 1 },
      })
    ).status,
    409,
  );
  const browserSend = async (
    kind: "transfers" | "ingest",
    payload: Record<string, any>,
  ) => {
    const r = await call(
      kind === "transfers" ? "/api/admin/transfers" : "/api/admin/ingest",
      payload,
      "admin",
    );
    assert.equal(r.status, 200);
    return r.json();
  };
  await pushBundle(bundle, browserSend);
  assert.equal(
    (
      await db
        .prepare("SELECT status FROM local_transfers WHERE id=?")
        .bind(registration.id)
        .first<{ status: string }>()
    )?.status,
    "complete",
  );
  assert.equal(
    (
      await db
        .prepare("SELECT checked_at FROM observations WHERE quote_id='S123:G1'")
        .first<{ checked_at: string }>()
    )?.checked_at,
    at,
  );
  const count = await db
    .prepare("SELECT COUNT(*) AS n FROM observations")
    .first<{ n: number }>();
  const skipped = await pushBundle(bundle, send);
  assert.equal(skipped.resumed, batches.length);
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM observations")
        .first<{ n: number }>()
    )?.n,
    count?.n,
  );
});

test("partial failures persist their exact batch; retry skips completed work and safely replays the partial batch", async () => {
  const bundle = {
    ...emptyBundle(),
    shops: [shop],
    quotes: [quote(), quote("G2")],
    mapping_fingerprints: { "S123:G1": fp, "S123:G2": fp },
  };
  const { registration, batches } = await transferPlan(bundle);
  await assert.rejects(() => pushBundle(bundle, send), /未完成/);
  const failed = await db
    .prepare(
      "SELECT done_batches,status,failed_index FROM local_transfers WHERE id=?",
    )
    .bind(registration.id)
    .first<{ done_batches: number; status: string; failed_index: number }>();
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.failed_index, batches.length - 1);
  assert.equal(failed?.done_batches, batches.length - 1);
  // Resolve the mapping conflict without modifying the original bundle or its timestamps.
  await db
    .prepare(
      "INSERT INTO mappings SELECT shop_id,'G2',sku,fingerprint,data FROM mappings WHERE source_id='G1'",
    )
    .run();
  const result = await pushBundle(bundle, send);
  assert.equal(result.resumed, failed!.done_batches);
  const receipt = await db
    .prepare(
      "SELECT attempts,status FROM local_transfer_batches WHERE transfer_id=? AND batch_index=?",
    )
    .bind(registration.id, batches.length - 1)
    .first<{ attempts: number; status: string }>();
  assert.equal(receipt?.attempts, 2);
  assert.equal(receipt?.status, "ok");
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM observations WHERE quote_id='S123:G1'",
        )
        .first<{ n: number }>()
    )?.n,
    1,
  );
});

test("a dropped client response resumes from durable receipts and active leases prevent concurrent import", async () => {
  const bundle = {
    ...emptyBundle(),
    review_items: [],
    product_definitions: [{ ...product, id: "plus-replay" }],
  };
  const { registration, batches } = await transferPlan(bundle);
  await send("transfers", registration);
  await db
    .prepare(
      "UPDATE local_transfers SET lease_until=?,lease_token='other' WHERE id=?",
    )
    .bind(new Date(Date.now() + 60000).toISOString(), registration.id)
    .run();
  assert.equal(
    (
      await call("/api/ingest", {
        ...batches[0],
        transfer: { id: registration.id, index: 0 },
      })
    ).status,
    409,
  );
  await db
    .prepare("UPDATE local_transfers SET lease_until=? WHERE id=?")
    .bind(new Date(Date.now() - 60000).toISOString(), registration.id)
    .run();
  await assert.rejects(
    () =>
      pushBundle(bundle, async (kind, payload) => {
        const result = await send(kind, payload);
        if (kind === "ingest") throw Error("response lost");
        return result;
      }),
    /response lost/,
  );
  assert.equal((await pushBundle(bundle, send)).resumed, 1);
});

test("candidate hints paginate pending enabled stores, prioritize new stores and deep link only the selected record", async () => {
  await db
    .prepare(
      "INSERT INTO shops(id,name,platform,url,data,enabled) VALUES('S456','另店','16688','https://www.16688.com.cn/shop/S456','{}',1),('S789','暂停店','16688','https://www.16688.com.cn/shop/S789','{}',0)",
    )
    .run();
  for (const [id, sid, title, status] of [
    ["S123:G10", "S123", "GPT Plus 已有店", "pending"],
    ["S456:G11", "S456", "ChatGPT Plus 候选", "pending"],
    ["S456:G12", "S456", "GPT Plus 排除", "rejected"],
    ["S789:G13", "S789", "GPT Plus 暂停", "pending"],
    ["S456:G14", "S456", "Claude Pro", "pending"],
  ])
    await db
      .prepare(
        "INSERT INTO goods(id,shop_id,source_id,title,data_at,reason,review_status) VALUES(?,?,?,?,?,'待审',?)",
      )
      .bind(id, sid, id.split(":")[1], title, at, status)
      .run();
  const r = await call(
    "/api/admin/coverage/candidates?sku=plus-ios",
    undefined,
    "admin",
  );
  assert.equal(r.status, 200);
  const data = (await r.json()) as { total: number; items: { id: string }[] };
  assert.equal(data.total, 2);
  assert.equal(data.items[0].id, "S456:G11");
  const page = (await (
    await call(
      "/api/admin/coverage/candidates?sku=plus-ios&offset=1",
      undefined,
      "admin",
    )
  ).json()) as { items: { id: string }[] };
  assert.equal(page.items.length, 1);
  const review = (await (
    await call("/api/admin/reviews?id=S456%3AG11", undefined, "admin")
  ).json()) as { items: { id: string }[] };
  assert.deepEqual(
    review.items.map((i) => i.id),
    ["S456:G11"],
  );
  const status = await call("/api/admin/collection-status", undefined, "admin");
  assert.equal(status.status, 200);
  const coverage = (await (
    await call("/api/admin/coverage", undefined, "admin")
  ).json()) as { summary: { products: number } };
  assert.equal(coverage.summary.products, 2);
});

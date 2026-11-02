import { seedShopStatement } from "../scripts/lib/seed-shop";
import { workerScript } from "./helpers/worker";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { MAX_SHOPS } from "../shared/site";
import { fingerprint } from "../src/domain";
import worker from "../src/index";
let mf: Miniflare,
  db: Awaited<ReturnType<Miniflare["getD1Database"]>>,
  cookie = "";
const raw = {
  goods_no: "G123",
  shop_no: "S123",
  name: "Plus 菲区月卡",
  description: "30天订阅，不可覆盖现有订阅。",
  price: 123,
  stock_available_quantity: 8,
  stock_available_status: "",
};
const password = "test-only-password-for-runtime";
async function call(
  path: string,
  body?: unknown,
  authenticated = false,
  origin = "http://example.test",
) {
  return mf.dispatchFetch("http://example.test" + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json", Origin: origin } : {}),
      ...(authenticated ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
before(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: await workerScript(),
      compatibilityDate: "2026-10-13",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "test" },
      bindings: {
        ADMIN_PASSWORD: password,
        PUBLIC_SITE: "true",
        COLLECTOR_INGEST_TOKEN: "test-only-collector-token-long-enough",
      },
      outboundService: async () => {
        throw Error("The Worker must never contact a storefront");
      },
    }),
  );
  await mf.ready;
  db = await mf.getD1Database("DB");
  await db.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
  await db.exec(
    readFileSync("migrations/0002_idempotent_shop_import.sql", "utf8"),
  );
  await db.exec(
    readFileSync("migrations/0003_external_collection.sql", "utf8"),
  );
  await db.exec(readFileSync("migrations/0005_shop_capacity_60.sql", "utf8"));
  await db.exec(readFileSync("migrations/0008_shop_capacity_200.sql", "utf8"));
  await db.exec(
    readFileSync("migrations/0009_application_shop_capacity.sql", "utf8"),
  );
  await db.exec(readFileSync("migrations/0010_public_rate_limits.sql", "utf8"));
  await db
    .prepare(
      "INSERT INTO shops(id,platform,token,name,url,data) VALUES('S123','16688','S123','Demo','https://www.16688.com.cn/shop/S123','{}')",
    )
    .run();
  await db
    .prepare("INSERT INTO products VALUES('plus','gpt',?)")
    .bind(
      JSON.stringify({
        id: "plus",
        category: "gpt",
        name: "Plus",
        spec: "30天 菲区",
      }),
    )
    .run();
  const fp = await fingerprint(raw),
    mapping = {
      sku: "plus",
      channel: "菲区",
      warranty: "30天订阅",
      spec_evidence: "明确月付",
      restriction: "不得覆盖",
    };
  await db
    .prepare("INSERT INTO mappings VALUES(?,?,?,?,?)")
    .bind("S123", "G123", "plus", fp, JSON.stringify(mapping))
    .run();
  await db
    .prepare(
      "INSERT INTO goods(id,shop_id,source_id,title,fingerprint,raw,data_at,reason,review_status) VALUES(?,?,?,?,?,?,?,'本地审核示例','approved')",
    )
    .bind(
      "S123:G123",
      "S123",
      "G123",
      raw.name,
      fp,
      JSON.stringify(raw),
      "2026-10-01T00:00:00Z",
    )
    .run();
  const q = {
    id: "S123:G123",
    source_goods_id: "G123",
    shop_id: "S123",
    sku: "plus",
    price: 120,
    checked_at: "2026-10-01T00:00:00Z",
    collection_status: "ok",
    listing_status: "listed",
    stock_status: "in_stock",
    availability: "ready",
  };
  await db
    .prepare("INSERT INTO quotes VALUES(?,?,?,?)")
    .bind(q.id, "S123", "plus", JSON.stringify(q))
    .run();
});
after(async () => {
  await mf?.dispose();
});
test("public detail and shop APIs remove inactive offers while keeping their stored history", async () => {
  await db
    .prepare("INSERT INTO products VALUES('eligible','gpt',?)")
    .bind(JSON.stringify({ id: "eligible", category: "gpt", name: "Eligible" }))
    .run();
  const base = {
    id: "S123:eligible",
    shop_id: "S123",
    sku: "eligible",
    price: 70,
    checked_at: new Date().toISOString(),
    collection_status: "ok",
    listing_status: "listed",
    stock_status: "in_stock",
    availability: "ready",
  };
  const rows = [
    base,
    {
      ...base,
      id: "S123:expired",
      price: 1,
      checked_at: "2020-01-01T00:00:00Z",
    },
    {
      ...base,
      id: "S123:unlisted",
      price: 2,
      listing_status: "not_listed",
      collection_status: "not_listed",
    },
    { ...base, id: "S123:soldout", price: 3, stock_status: "out" },
    { ...base, id: "S123:failed", price: 4, collection_status: "failed" },
    { ...base, id: "S123:restricted", price: 5, availability: "delayed" },
    { ...base, id: "S123:unknown", price: 6, stock_status: "unknown", availability: "unknown" },
  ];
  for (const row of rows)
    await db
      .prepare("INSERT INTO quotes VALUES(?,?,?,?)")
      .bind(row.id, "S123", "eligible", JSON.stringify(row))
      .run();
  try {
    for (const query of ["", "?sort=low&ready=0", "?sort=high"]) {
      const detail = (await (
        await call("/api/products/eligible" + query)
      ).json()) as { quotes: { id: string }[] };
      assert.deepEqual(
        detail.quotes.map((q) => q.id),
        [base.id],
      );
    }
    const shop = (await (await call("/api/shops/S123")).json()) as {
      quotes: { id: string }[];
      recorded_quotes: { id: string }[];
    };
    assert.deepEqual(
      shop.quotes
        .filter((q) => rows.some((row) => row.id === q.id))
        .map((q) => q.id),
      [base.id],
    );
    assert.deepEqual(
      shop.recorded_quotes.filter((q) => rows.some((row) => row.id === q.id)).map((q) => q.id).sort(),
      [base.id, "S123:soldout", "S123:restricted", "S123:unknown"].sort(),
    );
    const catalog = (await (await call("/api/products")).json()) as {
      products: { id: string; min_price: number }[];
    };
    assert.equal(
      catalog.products.find((p) => p.id === "eligible")?.min_price,
      70,
    );
    await db.prepare("UPDATE shops SET enabled=0 WHERE id='S123'").run();
    const paused = (await (await call("/api/products/eligible")).json()) as {
      quotes: unknown[];
    };
    assert.deepEqual(paused.quotes, []);
    assert.equal(
      (
        await db
          .prepare("SELECT COUNT(*) AS n FROM quotes WHERE sku='eligible'")
          .first<{ n: number }>()
      )?.n,
      rows.length,
    );
  } finally {
    await db.prepare("UPDATE shops SET enabled=1 WHERE id='S123'").run();
    await db.prepare("DELETE FROM quotes WHERE sku='eligible'").run();
    await db.prepare("DELETE FROM products WHERE id='eligible'").run();
  }
});
test("unauthenticated mutations and full snapshot reads are blocked", async () => {
  assert.equal(
    (await call("/api/admin/collect", { shop_id: "all" })).status,
    401,
  );
  assert.equal((await call("/data/snapshot.json")).status, 404);
  const r = await call("/api/products");
  assert.equal(r.status, 200);
  const d = (await r.json()) as { stats: { available: number } };
  assert.equal(d.stats.available, 0);
});
test("login uses HttpOnly cookie; cross-origin mutations and invalid schedule are rejected", async () => {
  const r = await call("/api/admin/login", { password });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("set-cookie") || "", /HttpOnly/);
  cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  assert.equal(
    (
      await call(
        "/api/admin/collect",
        { shop_id: "all" },
        true,
        "https://evil.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/admin/settings",
        { auto_enabled: true, interval_days: 3, freshness_hours: 48 },
        true,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/api/admin/settings",
        { auto_enabled: false, interval_days: 3, freshness_hours: 96 },
        true,
      )
    ).status,
    200,
  );
});
test("the Worker exports only the HTTP entry point", () => {
  assert.deepEqual(Object.keys(worker), ["fetch"]);
});
test("legacy settings and shop flags cannot re-enable cloud collection", async () => {
  await db.prepare("UPDATE settings SET auto_enabled=1 WHERE id=1").run();
  await db.prepare("UPDATE shops SET cloud_enabled=1 WHERE id='S123'").run();
  const response = await call(
    "/api/admin/settings",
    { auto_enabled: true, interval_days: 3, freshness_hours: 96 },
    true,
  );
  assert.equal(response.status, 200);
  const dashboard = await call("/api/admin/dashboard", undefined, true);
  const data = (await dashboard.json()) as {
    local_collection_only: boolean;
    settings: {
      auto_enabled: number;
      interval_days: number;
      freshness_hours: number;
      last_auto_at: string | null;
    };
    shops: { cloud_enabled: boolean }[];
  };
  assert.equal(data.local_collection_only, true);
  assert.equal(data.settings.auto_enabled, 0);
  assert.equal(data.settings.interval_days, 3);
  assert.equal(data.settings.freshness_hours, 96);
  assert.ok(Object.hasOwn(data.settings, "last_auto_at"));
  assert.equal(data.shops[0].cloud_enabled, false);
});
test("online review approval stays blocked while rejection remains available", async () => {
  const id = "S123:G999";
  await db
    .prepare(
      "INSERT INTO goods(id,shop_id,source_id,title,raw,data_at,reason,review_status) VALUES(?,?,?,?,?,?,'待审核示例','pending')",
    )
    .bind(
      id,
      "S123",
      "G999",
      raw.name,
      JSON.stringify({ ...raw, goods_no: "G999" }),
      new Date().toISOString(),
    )
    .run();
  try {
    const pending = (await (
      await call("/api/admin/reviews?id=" + id, undefined, true)
    ).json()) as { items: { id: string }[] };
    assert.equal(pending.items[0].id, id);
    const approval = await call(
      "/api/admin/review",
      {
        id,
        action: "approve",
        sku: "plus",
        channel: "菲区",
        warranty: "30天订阅",
        evidence: "明确月付",
        restriction: "不得覆盖",
      },
      true,
    );
    assert.equal(approval.status, 400);
    assert.match(
      ((await approval.json()) as { error: string }).error,
      /本地.*审核/,
    );
    assert.equal(
      await db
        .prepare("SELECT sku FROM mappings WHERE source_id='G999'")
        .first(),
      null,
    );
    assert.equal(
      (await call("/api/admin/review", { id, action: "reject" }, true)).status,
      200,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT review_status FROM goods WHERE id=?")
          .bind(id)
          .first<{ review_status: string }>()
      )?.review_status,
      "rejected",
    );
  } finally {
    await db.prepare("DELETE FROM goods WHERE id=?").bind(id).run();
  }
});
test("application capacity remains atomic during concurrent registrations and permits existing shop retries", async () => {
  for (let i = 1; i < MAX_SHOPS - 1; i++)
    await db
      .prepare("INSERT INTO shops(id,platform,name,url,data) VALUES(?,?,?,?,?)")
      .bind("extra" + i, "16688", "fixture", "https://example.com", "{}")
      .run();
  const register = (id: string) =>
    call(
      "/api/admin/import",
      {
        kind: "shop",
        shop_id: id,
        status: "ok",
        checked_at: new Date().toISOString(),
        source_item_count: 0,
        shop: {
          id,
          platform: "16688",
          name: "容量测试",
          url: `https://www.16688.com.cn/shop/${id}`,
        },
      },
      true,
    );
  const results = await Promise.all([register("S999991"), register("S999992")]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM shops").first<{ n: number }>())
      ?.n,
    MAX_SHOPS,
  );
  const accepted = results[0].status === 200 ? "S999991" : "S999992";
  assert.equal((await register(accepted)).status, 200);
  const denied = await register("S999993");
  assert.equal(denied.status, 409);
  assert.match(await denied.text(), new RegExp(String(MAX_SHOPS)));
  const seedShop = {
    id: accepted,
    platform: "16688",
    name: "Seed retry",
    url: "https://example.com",
    collection_status: "ok",
    checked_at: new Date().toISOString(),
  };
  assert.equal(
    (await db.prepare(seedShopStatement(seedShop, accepted)).run()).meta
      .changes,
    0,
  );
  await assert.rejects(
    () =>
      db
        .prepare(seedShopStatement({ ...seedShop, id: "S999994" }, "S999994"))
        .run(),
    /NOT NULL/,
  );
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM shops").first<{ n: number }>())
      ?.n,
    MAX_SHOPS,
  );
  assert.equal(
    await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name='shop_cap'",
      )
      .first(),
    null,
  );
});
test("server-side leads are stored without triggering collection and strip tracking parameters", async () => {
  const r = await call("/api/leads", {
    name: "Candidate",
    url: "https://example.com/shop?aff=third",
    note: "review later",
  });
  assert.equal(r.status, 201);
  const lead = await db
    .prepare("SELECT url,status FROM leads")
    .first<{ url: string; status: string }>();
  assert.equal(lead?.url, "https://example.com/shop");
  assert.equal(lead?.status, "pending");
});
test("private preview hides all quote data and fails closed when the admin secret is absent", async () => {
  const isolated = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: await workerScript(),
      compatibilityDate: "2026-10-13",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "private" },
      bindings: { PUBLIC_SITE: "false" },
    }),
  );
  try {
    await isolated.ready;
    const database = await isolated.getD1Database("DB");
    await database.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
    assert.equal(
      (await isolated.dispatchFetch("https://private.test/api/products"))
        .status,
      401,
    );
    assert.equal(
      (
        await isolated.dispatchFetch("https://private.test/api/admin/login", {
          method: "POST",
          headers: {
            Origin: "https://private.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password: "anything" }),
        })
      ).status,
      503,
    );
  } finally {
    await isolated.dispose();
  }
});

test("external collector import enforces approved mappings and preserves original time", async () => {
  const fp = await fingerprint(raw),
    at = new Date().toISOString();
  const q = {
    id: "S123:G123",
    shop_id: "S123",
    source_goods_id: "G123",
    sku: "plus",
    item_name: raw.name,
    price: 124,
    currency: "CNY",
    item_url: "https://www.16688.com.cn/goods/G123",
    checked_at: at,
    collection_status: "ok",
    listing_status: "listed",
    stock_status: "in_stock",
    stock_count: 4,
    availability: "ready",
  };
  assert.equal(
    (
      await call(
        "/api/admin/import",
        {
          kind: "quote",
          shop_id: "S123",
          quote: q,
          mapping_fingerprint: "wrong",
        },
        true,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        "/api/admin/import",
        { kind: "quote", shop_id: "S123", quote: q, mapping_fingerprint: fp },
        true,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/api/admin/import",
        {
          kind: "quote",
          shop_id: "S123",
          quote: { ...q, stock_count: 0 },
          mapping_fingerprint: fp,
        },
        true,
      )
    ).status,
    400,
  );
  const saved = JSON.parse(
    (await db
      .prepare("SELECT data FROM quotes WHERE id=?")
      .bind(q.id)
      .first<{ data: string }>())!.data,
  );
  assert.equal(saved.checked_at, at);
  assert.equal(saved.acquisition_method, "external_local");
  const old = { ...q, checked_at: "2026-10-01T00:00:00Z", price: 110 };
  const r = await call(
    "/api/admin/import",
    { kind: "quote", shop_id: "S123", quote: old, mapping_fingerprint: fp },
    true,
  );
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as { updated: boolean }).updated, false);
  assert.equal(
    JSON.parse(
      (await db
        .prepare("SELECT data FROM quotes WHERE id=?")
        .bind(q.id)
        .first<{ data: string }>())!.data,
    ).price,
    124,
  );
});
test("a scoped collector batch leaves omitted shops and their observations unchanged", async () => {
  const at = "2026-01-01T00:00:00Z";
  await db.prepare("INSERT INTO shops(id,platform,token,name,url,data,checked_at) VALUES(?,?,?,?,?,?,?)")
    .bind("S999", "16688", "S999", "Outside scope", "https://www.16688.com.cn/shop/S999", JSON.stringify({ checked_at: at }), at).run();
  await db.prepare("INSERT INTO quotes VALUES(?,?,?,?)")
    .bind("S999:G999", "S999", "plus", JSON.stringify({ id: "S999:G999", shop_id: "S999", price: 99, checked_at: at })).run();
  const outside = async () => ({
    shop: await db.prepare("SELECT * FROM shops WHERE id='S999'").first(),
    quote: await db.prepare("SELECT * FROM quotes WHERE id='S999:G999'").first(),
  });
  const before = await outside();
  try {
    const response = await mf.dispatchFetch("http://example.test/api/ingest", {
      method: "POST",
      headers: { Authorization: "Bearer test-only-collector-token-long-enough", "Content-Type": "application/json" },
      body: JSON.stringify({ schema_version: 1, shops: [{ id: "S123", collection_status: "ok", checked_at: new Date().toISOString(), source_item_count: 1 }], quotes: [], review_items: [], mapping_fingerprints: {} }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await outside(), before);
  } finally {
    await db.prepare("DELETE FROM quotes WHERE id='S999:G999'").run();
    await db.prepare("DELETE FROM shops WHERE id='S999'").run();
  }
});
test("retired collection endpoints return 410 without creating jobs or changing quotes", async () => {
  const before = (await db.prepare("SELECT data FROM quotes ORDER BY id").all())
    .results;
  for (const path of ["/api/admin/collect", "/api/admin/recover"]) {
    const response = await call(path, { shop_id: "S123" }, true);
    assert.equal(response.status, 410);
    assert.deepEqual(await response.json(), {
      error: "线上仅接收本地采集结果",
    });
  }
  // Compare rows only; query metadata such as duration varies between runs.
  assert.deepEqual(
    (await db.prepare("SELECT data FROM quotes ORDER BY id").all()).results,
    before,
  );
  for (const table of ["runs", "jobs"])
    assert.equal(
      (
        await db
          .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
          .first<{ n: number }>()
      )?.n,
      0,
    );
});

test("local review mapping requires matching detail and prior fingerprint; replay is idempotent", async () => {
  const updatedRaw = {
    ...raw,
    description: raw.description + " 售后条件已明确。",
  };
  const prior = await fingerprint(raw),
    fp = await fingerprint(updatedRaw);
  const payload = {
    kind: "mapping",
    shop_id: "S123",
    goods_id: "G123",
    previous_fingerprint: prior,
    reviewed_at: new Date().toISOString(),
    raw: updatedRaw,
    mapping: {
      shop_id: "S123",
      sku: "plus",
      accepted_fingerprint: fp,
      channel: "菲区",
      warranty: "30天订阅",
      spec_evidence: "明确月付",
      restriction: "不得覆盖",
    },
  };
  assert.equal(
    (await call("/api/admin/import", { ...payload, raw }, true)).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/api/admin/import",
        { ...payload, previous_fingerprint: "stale" },
        true,
      )
    ).status,
    409,
  );
  assert.equal((await call("/api/admin/import", payload, true)).status, 200);
  const q = JSON.parse(
    (await db
      .prepare("SELECT data FROM quotes WHERE id='S123:G123'")
      .first<{ data: string }>())!.data,
  );
  assert.equal(q.collection_status, "needs_review");
  assert.equal(
    (await db
      .prepare("SELECT review_status FROM goods WHERE id='S123:G123'")
      .first<{ review_status: string }>())!.review_status,
    "approved",
  );
  const replay = await call("/api/admin/import", payload, true);
  assert.equal(replay.status, 200);
  assert.equal(((await replay.json()) as { updated: boolean }).updated, false);
});

test("later failure status wins over a replayed success without fabricating observation times", async () => {
  const old = JSON.parse(
    (await db
      .prepare("SELECT data FROM quotes WHERE id='S123:G123'")
      .first<{ data: string }>())!.data,
  );
  const fp = await fingerprint({
    ...raw,
    description: raw.description + " 售后条件已明确。",
  });
  const failed = {
    ...old,
    collection_status: "failed",
    attempted_at: new Date(Date.now() + 1000).toISOString(),
  };
  assert.equal(
    (
      await call(
        "/api/admin/import",
        {
          kind: "quote",
          shop_id: "S123",
          quote: failed,
          mapping_fingerprint: fp,
        },
        true,
      )
    ).status,
    200,
  );
  const replay = await call(
    "/api/admin/import",
    {
      kind: "quote",
      shop_id: "S123",
      quote: { ...old, collection_status: "ok" },
      mapping_fingerprint: fp,
    },
    true,
  );
  assert.equal(((await replay.json()) as { updated: boolean }).updated, false);
  const saved = JSON.parse(
    (await db
      .prepare("SELECT data FROM quotes WHERE id='S123:G123'")
      .first<{ data: string }>())!.data,
  );
  assert.equal(saved.collection_status, "failed");
  assert.equal(saved.checked_at, old.checked_at);
});

test("reimporting review candidates cannot undo a manual exclusion", async () => {
  assert.equal(
    (
      await call(
        "/api/admin/review",
        { id: "S123:G123", action: "reject" },
        true,
      )
    ).status,
    200,
  );
  const r = await call(
    "/api/admin/import",
    {
      kind: "reviews",
      shop_id: "S123",
      checked_at: new Date().toISOString(),
      items: [
        {
          shop_id: "S123",
          goods_id: "G123",
          name: raw.name,
          reason: "再次采集",
        },
      ],
    },
    true,
  );
  assert.equal(r.status, 200);
  assert.equal(
    (await db
      .prepare("SELECT review_status FROM goods WHERE id='S123:G123'")
      .first<{ review_status: string }>())!.review_status,
    "rejected",
  );
});

test("collector-only state and bounded ingest enforce authentication and reject oversized or orphan batches", async () => {
  assert.equal((await call("/api/collector/state")).status, 401);
  const headers = {
    Authorization: "Bearer test-only-collector-token-long-enough",
    "Content-Type": "application/json",
  };
  const state = await mf.dispatchFetch(
    "http://example.test/api/collector/state",
    { headers },
  );
  assert.equal(state.status, 200);
  const result = (await state.json()) as { rejected: { source_id: string }[] };
  assert.equal(result.rejected[0].source_id, "G123");
  const base = {
    schema_version: 1,
    shops: [],
    quotes: [],
    review_items: [],
    mapping_fingerprints: {},
  };
  const dispatch = (body: unknown) =>
    mf.dispatchFetch("http://example.test/api/ingest", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await dispatch({
        ...base,
        quotes: Array.from({ length: 6 }, () => ({ shop_id: "S123" })),
      })
    ).status,
    413,
  );
  assert.equal(
    (await dispatch({ ...base, quotes: [{ shop_id: "S123" }] })).status,
    400,
  );
  assert.equal((await dispatch(base)).status, 200);
});

test("a newly reviewed item can enter an existing SKU, but an old approval cannot restore a later exclusion", async () => {
  const detail = { ...raw, goods_no: "G456" };
  const fp = await fingerprint(detail);
  const payload = {
    kind: "mapping",
    shop_id: "S123",
    goods_id: "G456",
    previous_fingerprint: null,
    reviewed_at: new Date(Date.now() - 1000).toISOString(),
    raw: detail,
    mapping: {
      shop_id: "S123",
      sku: "plus",
      accepted_fingerprint: fp,
      channel: "菲区",
      warranty: "商家质保30天",
      spec_evidence: "30天月付说明",
      restriction: "不可覆盖",
    },
  };
  assert.equal((await call("/api/admin/import", payload, true)).status, 200);
  assert.equal(
    (
      await call(
        "/api/admin/review",
        { id: "S123:G456", action: "reject" },
        true,
      )
    ).status,
    200,
  );
  assert.equal((await call("/api/admin/import", payload, true)).status, 409);
  assert.equal(
    await db.prepare("SELECT sku FROM mappings WHERE source_id='G456'").first(),
    null,
  );
  assert.equal(
    (await db
      .prepare("SELECT review_status FROM goods WHERE id='S123:G456'")
      .first<{ review_status: string }>())!.review_status,
    "rejected",
  );
});

test("new catalog specs import before mappings; existing definitions cannot silently change", async () => {
  const product = {
    id: "runway-pro-month",
    category: "other",
    name: "Runway Pro 月付直充",
    spec: "1个月 · CDK直充 · 现有账号",
    channel: "CDK直充",
    brand: "runway",
    family: "Runway",
    kind: "直充",
  };
  assert.equal(
    (await call("/api/admin/import", { kind: "product", product }, true))
      .status,
    200,
  );
  assert.equal(
    (await call("/api/admin/import", { kind: "product", product }, true))
      .status,
    200,
  );
  assert.equal(
    (
      await call(
        "/api/admin/import",
        { kind: "product", product: { ...product, category: "unknown" } },
        true,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/api/admin/import",
        { kind: "product", product: { ...product, spec: "一年" } },
        true,
      )
    ).status,
    409,
  );
  const data = (await (await call("/api/products?category=other")).json()) as {
    products: { id: string; spec: string }[];
  };
  assert.equal(
    data.products.find((p) => p.id === product.id)?.spec,
    product.spec,
  );
});

test("public lead rate limits use their own daily window without consuming administrator login attempts", async () => {
  const { hash } = await import("../src/domain");
  const key = await hash("lead:203.0.113.20");
  const before = await db
    .prepare("SELECT COUNT(*) n FROM login_limits")
    .first<{ n: number }>();
  const lead = (n: number) =>
    mf.dispatchFetch("http://example.test/api/leads", {
      method: "POST",
      headers: {
        Origin: "http://example.test",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.20",
      },
      body: JSON.stringify({
        name: "限流测试",
        url: `https://limit.test/${n}`,
        note: "",
      }),
    });
  for (let i = 0; i < 5; i++) assert.equal((await lead(i)).status, 201);
  assert.equal((await lead(6)).status, 429);
  assert.equal(
    (
      await db
        .prepare("SELECT attempts FROM rate_limits WHERE key=?")
        .bind(key)
        .first<{ attempts: number }>()
    )?.attempts,
    5,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM login_limits")
        .first<{ n: number }>()
    )?.n,
    before?.n,
  );
  assert.equal(
    await db
      .prepare("SELECT key FROM login_limits WHERE key=?")
      .bind(key)
      .first(),
    null,
  );
  await db
    .prepare(
      "UPDATE rate_limits SET expires_at='2000-01-01T00:00:00Z' WHERE key=?",
    )
    .bind(key)
    .run();
  assert.equal((await lead(7)).status, 201);
  assert.equal(
    (
      await db
        .prepare("SELECT attempts FROM rate_limits WHERE key=?")
        .bind(key)
        .first<{ attempts: number }>()
    )?.attempts,
    1,
  );
});

test("rate limit migration preserves unexpired legacy lead windows and existing login rows", async () => {
  const migrationMf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch(){return new Response('ok')}}",
      d1Databases: { DB: "rate-migration" },
    }),
  );
  try {
    const legacy = await migrationMf.getD1Database("DB");
    await legacy.exec(
      "CREATE TABLE login_limits(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at TEXT NOT NULL); INSERT INTO login_limits VALUES('active',4,'2099-01-01T00:00:00Z'),('expired',5,'2000-01-01T00:00:00Z');",
    );
    await legacy.exec(
      readFileSync("migrations/0010_public_rate_limits.sql", "utf8"),
    );
    assert.equal(
      (
        await legacy
          .prepare("SELECT attempts FROM rate_limits WHERE key='active'")
          .first<{ attempts: number }>()
      )?.attempts,
      4,
    );
    assert.equal(
      await legacy
        .prepare("SELECT key FROM rate_limits WHERE key='expired'")
        .first(),
      null,
    );
    assert.equal(
      (
        await legacy
          .prepare("SELECT COUNT(*) n FROM login_limits")
          .first<{ n: number }>()
      )?.n,
      2,
    );
  } finally {
    await migrationMf.dispose();
  }
});

test("malformed or oversized request bodies are client errors, not 500", async () => {
  const post = (body: string) =>
    mf.dispatchFetch("http://example.test/api/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://example.test",
      },
      body,
    });
  for (const body of ["{not json", "[1]", "null"]) {
    const response = await post(body);
    assert.equal(response.status, 400, body);
    assert.match(((await response.json()) as { error: string }).error, /JSON/);
  }
  assert.equal(
    (await post(JSON.stringify({ note: "x".repeat(9000) }))).status,
    413,
  );
});

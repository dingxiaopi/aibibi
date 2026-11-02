import { workerScript } from "./helpers/worker";
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import type { SponsorCampaign, PublicSponsor } from "../shared/sponsors";
let mf: Miniflare,
  db: Awaited<ReturnType<Miniflare["getD1Database"]>>,
  cookie = "";
const ua = "Mozilla/5.0 SponsorRuntimeTest";
async function call(
  path: string,
  value?: unknown,
  auth = false,
  origin = "http://sponsors.test",
  agent = ua,
) {
  return mf.dispatchFetch("http://sponsors.test" + path, {
    redirect: "manual",
    method: value === undefined ? "GET" : "POST",
    headers: {
      "User-Agent": agent,
      ...(value === undefined
        ? {}
        : { "Content-Type": "application/json", Origin: origin }),
      ...(auth ? { Cookie: cookie } : {}),
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
}
const draft = (extra: Record<string, unknown> = {}) => ({
  slot: "hero",
  category: "all",
  status: "draft",
  brand: "内部测试品牌",
  title: "内部测试，不是真实赞助",
  description: "测试说明",
  cta: "了解详情",
  target_url: "https://example.com/sponsor",
  logo_asset: "",
  desktop_asset: "",
  mobile_asset: "",
  starts_at: new Date(Date.now() - 60000).toISOString(),
  ends_at: new Date(Date.now() + 86400000).toISOString(),
  ...extra,
});
async function save(value: Record<string, unknown>) {
  const response = await call("/api/admin/sponsors", value, true);
  assert.equal(response.status, 200, await response.clone().text());
  return ((await response.json()) as { id: string }).id;
}
async function campaigns() {
  return (
    (await (await call("/api/admin/sponsors", undefined, true)).json()) as {
      campaigns: SponsorCampaign[];
    }
  ).campaigns;
}
async function publicAds(page = "home", category = "all") {
  return (
    (await (
      await call(`/api/sponsors?page=${page}&category=${category}`)
    ).json()) as { ads: PublicSponsor[] }
  ).ads;
}
async function metrics() {
  return (await db
    .prepare(
      "SELECT COALESCE(SUM(impressions),0) AS impressions,COALESCE(SUM(clicks),0) AS clicks FROM sponsor_daily",
    )
    .first<{ impressions: number; clicks: number }>())!;
}
before(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: await workerScript(),
      compatibilityDate: "2026-10-13",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "sponsor-test" },
      bindings: {
        ADMIN_PASSWORD: "sponsor-runtime-only-password",
        PUBLIC_SITE: "true",
      },
    }),
  );
  await mf.ready;
  db = await mf.getD1Database("DB");
  await db.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
  await db.exec(
    readFileSync("migrations/0003_external_collection.sql", "utf8"),
  );
  await db.exec(readFileSync("migrations/0004_sponsorship.sql", "utf8"));
  await db
    .prepare(
      "INSERT INTO shops(id,platform,name,url,data) VALUES('S_ad','16688','Quote source','https://example.com/shop','{}')",
    )
    .run();
  await db
    .prepare("INSERT INTO products VALUES('plus','gpt',?)")
    .bind(
      JSON.stringify({
        id: "plus",
        name: "Plus",
        category: "gpt",
        spec: "30天",
      }),
    )
    .run();
  await db
    .prepare("INSERT INTO quotes VALUES('S_ad:G1','S_ad','plus',?)")
    .bind(
      JSON.stringify({
        id: "S_ad:G1",
        sku: "plus",
        price: 120,
        stock_status: "in_stock",
        availability: "ready",
        listing_status: "listed",
        collection_status: "ok",
        checked_at: new Date().toISOString(),
      }),
    )
    .run();
  const response = await call("/api/admin/login", {
    password: "sponsor-runtime-only-password",
  });
  assert.equal(response.status, 200);
  cookie = response.headers.get("Set-Cookie")!.split(";")[0];
});
beforeEach(async () => {
  for (const table of [
    "sponsor_deliveries",
    "sponsor_daily",
    "sponsor_revisions",
    "sponsor_campaigns",
    "sponsor_limits",
    "sponsor_inquiries",
    "sponsor_assets",
  ])
    await db.prepare(`DELETE FROM ${table}`).run();
});
after(async () => {
  await mf.dispose();
});

test("sponsor management requires login and same-origin writes; empty public inventory hides all ads", async () => {
  assert.equal((await call("/api/admin/sponsors")).status, 401);
  assert.equal((await call("/api/admin/sponsors", draft())).status, 401);
  assert.equal(
    (await call("/api/admin/sponsors", draft(), true, "https://foreign.test"))
      .status,
    403,
  );
  assert.deepEqual(await publicAds(), []);
  assert.equal((await call("/api/sponsors?page=unknown")).status, 400);
  assert.equal(
    (await call("/api/admin/sponsors?from=2026-99-99", undefined, true)).status,
    400,
  );
});

test("only active, in-window, relevant campaigns are served; scheduled, draft, expired and paused ads stay hidden", async () => {
  const id = await save(draft());
  assert.deepEqual(await publicAds(), []);
  let [c] = await campaigns();
  await save({
    ...c,
    status: "active",
    starts_at: new Date(Date.now() + 3600000).toISOString(),
    ends_at: new Date(Date.now() + 7200000).toISOString(),
  });
  assert.deepEqual(await publicAds(), []);
  [c] = await campaigns();
  await save({
    ...c,
    status: "active",
    starts_at: new Date(Date.now() - 60000).toISOString(),
    ends_at: new Date(Date.now() + 60000).toISOString(),
    category: "claude",
  });
  assert.deepEqual(await publicAds(), []);
  assert.equal((await publicAds("home", "claude"))[0].id, id);
  assert.deepEqual(await publicAds("detail", "claude"), []);
  [c] = await campaigns();
  await save({ ...c, status: "paused" });
  assert.deepEqual(await publicAds("home", "claude"), []);
  [c] = await campaigns();
  await save({
    ...c,
    status: "active",
    starts_at: new Date(Date.now() - 120000).toISOString(),
    ends_at: new Date(Date.now() - 60000).toISOString(),
  });
  assert.deepEqual(await publicAds("home", "claude"), []);
});

test("database enforces overlapping schedule conflicts, including concurrent saves and all-brand targeting", async () => {
  const [a, b] = await Promise.all([
    call("/api/admin/sponsors", draft({ status: "active" }), true),
    call("/api/admin/sponsors", draft({ status: "active" }), true),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(
    (
      await call(
        "/api/admin/sponsors",
        draft({ status: "active", category: "gpt" }),
        true,
      )
    ).status,
    409,
  );
  await save(draft({ status: "active", slot: "detail", category: "gpt" }));
  await save(draft({ status: "active", slot: "detail", category: "claude" }));
  assert.equal(
    (
      await call(
        "/api/admin/sponsors",
        draft({ status: "active", slot: "detail", category: "all" }),
        true,
      )
    ).status,
    409,
  );
});

test("optimistic revisions reject stale updates and preserve history; editing invalidates old delivery links", async () => {
  const id = await save(draft({ status: "active" }));
  const ad = (await publicAds())[0];
  const [c] = await campaigns();
  await save({ ...c, title: "更新后的广告" });
  assert.equal(
    (await call("/api/admin/sponsors", { ...c, title: "过期编辑" }, true))
      .status,
    409,
  );
  const revisions = (await (
    await call(`/api/admin/sponsors/revisions?id=${id}`, undefined, true)
  ).json()) as { revisions: unknown[] };
  assert.equal(revisions.revisions.length, 2);
  assert.equal(
    (await call(`/api/sponsors/click/${ad.delivery_id}`)).status,
    410,
  );
});

test("trusted delivery receipts deduplicate impressions and clicks atomically, including fast clicks", async () => {
  await save(draft({ status: "active" }));
  const ad = (await publicAds())[0];
  assert.deepEqual(await metrics(), { impressions: 0, clicks: 0 });
  assert.equal(
    (
      await call(
        "/api/sponsors/impression",
        { delivery_id: ad.delivery_id },
        false,
        "https://foreign.test",
      )
    ).status,
    403,
  );
  await call(
    "/api/sponsors/impression",
    { delivery_id: ad.delivery_id },
    false,
    "http://sponsors.test",
    "Different browser",
  );
  assert.equal((await metrics()).impressions, 0);
  await Promise.all([
    call("/api/sponsors/impression", { delivery_id: ad.delivery_id }),
    call("/api/sponsors/impression", { delivery_id: ad.delivery_id }),
  ]);
  assert.deepEqual(await metrics(), { impressions: 1, clicks: 0 });
  const clicks = await Promise.all([
    call(`/api/sponsors/click/${ad.delivery_id}`),
    call(`/api/sponsors/click/${ad.delivery_id}`),
  ]);
  assert.equal(clicks[0].status, 302);
  assert.equal(
    clicks[0].headers.get("Location"),
    "https://example.com/sponsor",
  );
  assert.deepEqual(await metrics(), { impressions: 1, clicks: 1 });
  const fast = (await publicAds())[0];
  await call(`/api/sponsors/click/${fast.delivery_id}`);
  assert.deepEqual(await metrics(), { impressions: 2, clicks: 2 });
  const report = await call("/api/admin/sponsors/report.csv", undefined, true);
  assert.equal(report.status, 200);
  assert.match(await report.text(), /100.00%/);
  const [recorded] = await campaigns();
  assert.equal(
    (await call("/api/admin/sponsors", { ...recorded, slot: "detail" }, true))
      .status,
    409,
  );
  assert.equal(
    (
      await call(
        "/api/admin/sponsors",
        { ...recorded, brand: "Different advertiser" },
        true,
      )
    ).status,
    409,
  );
});

test("paused or expired delivery receipts cannot add metrics; known bots receive no ad inventory", async () => {
  await save(draft({ status: "active" }));
  const ad = (await publicAds())[0];
  const [c] = await campaigns();
  await save({ ...c, status: "paused" });
  assert.equal(
    (await call("/api/sponsors/impression", { delivery_id: ad.delivery_id }))
      .status,
    410,
  );
  assert.equal(
    (await call(`/api/sponsors/click/${ad.delivery_id}`)).status,
    410,
  );
  assert.deepEqual(await metrics(), { impressions: 0, clicks: 0 });
  const response = await call(
    "/api/sponsors?page=home",
    undefined,
    false,
    "http://sponsors.test",
    "ExampleCrawler/1.0",
  );
  assert.deepEqual(((await response.json()) as { ads: unknown[] }).ads, []);
});

test("assets are bounded raster uploads and unsafe links or nonexistent asset IDs are rejected", async () => {
  assert.equal(
    (
      await call(
        "/api/admin/sponsors",
        draft({ target_url: "javascript:alert(1)" }),
        true,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/api/admin/sponsors",
        draft({ logo_asset: crypto.randomUUID() }),
        true,
      )
    ).status,
    400,
  );
  const png = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5/8AAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const upload = await mf.dispatchFetch(
    "http://sponsors.test/api/admin/sponsors/assets",
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://sponsors.test",
        "Content-Type": "image/png",
      },
      body: png,
    },
  );
  assert.equal(upload.status, 201);
  const { id } = (await upload.json()) as { id: string };
  const asset = await call(`/api/sponsors/assets/${id}`);
  assert.equal(asset.headers.get("Content-Type"), "image/png");
  assert.equal((await asset.arrayBuffer()).byteLength, png.length);
  await save(draft({ logo_asset: id }));
  const invalid = await mf.dispatchFetch(
    "http://sponsors.test/api/admin/sponsors/assets",
    {
      method: "POST",
      headers: { Cookie: cookie, Origin: "http://sponsors.test" },
      body: "<svg onload='alert(1)'/>",
    },
  );
  assert.equal(invalid.status, 400);
  await invalid.text();
  const oversized = await mf.dispatchFetch(
    "http://sponsors.test/api/admin/sponsors/assets",
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://sponsors.test",
        "Content-Length": String(512 * 1024 + 1),
        Connection: "close",
      },
      body: new Uint8Array(512 * 1024 + 1),
    },
  );
  assert.equal(oversized.status, 400);
  await oversized.text();
});

test("cooperation inquiries are private, rate-limited, and can be marked handled without sending messages", async () => {
  const inquiry = {
    brand: "内部合作测试",
    contact: "test@example.com",
    message: "内部测试，不发送消息",
    slot: "unsure",
    website: "",
  };
  assert.equal(
    (
      await call(
        "/api/sponsors/inquiry",
        inquiry,
        false,
        "https://foreign.test",
      )
    ).status,
    403,
  );
  assert.equal(
    (await call("/api/sponsors/inquiry", { ...inquiry, website: "trap" }))
      .status,
    200,
  );
  assert.equal((await call("/api/sponsors/inquiry", inquiry)).status, 201);
  assert.equal((await call("/api/sponsors/inquiry", inquiry)).status, 201);
  assert.equal((await call("/api/sponsors/inquiry", inquiry)).status, 429);
  assert.equal((await call("/api/sponsors/inquiries")).status, 404);
  const row = await db
    .prepare("SELECT id FROM sponsor_inquiries LIMIT 1")
    .first<{ id: string }>();
  assert.ok(row);
  assert.equal(
    (
      await call(
        "/api/admin/sponsors/inquiry",
        { id: row.id, status: "contacted" },
        true,
      )
    ).status,
    200,
  );
  assert.equal(
    (await db
      .prepare("SELECT status FROM sponsor_inquiries WHERE id=?")
      .bind(row.id)
      .first<{ status: string }>())!.status,
    "contacted",
  );
});

test("active sponsorship cannot alter quote data, minimum price or natural product results", async () => {
  const before = await (await call("/api/products")).json();
  await save(draft({ status: "active" }));
  await save(draft({ status: "active", slot: "home-inline" }));
  await publicAds();
  const after = await (await call("/api/products")).json();
  assert.deepEqual(after, before);
});

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { workerScript } from "./helpers/worker";
import { safeJson } from "../src/seo/content";
let mf: Miniflare;
const asset =
  '<!doctype html><html><head><title>default</title><meta name="description" content="default"></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
const name = 'Plus 中文 <img src=x onerror="bad()">';
const call = (path: string, method = "GET") =>
  mf.dispatchFetch(`https://example.test${path}`, { method });
const schema = (html: string) =>
  JSON.parse(
    html.match(
      /<script type="application\/ld\+json" id="product-schema">(.*?)<\/script>/s,
    )![1],
  );
before(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: await workerScript(),
      compatibilityDate: "2026-10-13",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "seo" },
      bindings: { PUBLIC_SITE: "true" },
      serviceBindings: {
        ASSETS: async () =>
          new Response(asset, { headers: { "Content-Type": "text/html" } }),
      },
    }),
  );
  const db = await mf.getD1Database("DB");
  for (const file of [
    "0001_initial.sql",
    "0002_idempotent_shop_import.sql",
    "0003_external_collection.sql",
  ])
    await db.exec(readFileSync(`migrations/${file}`, "utf8"));
  const now = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO shops(id,platform,name,url,data,checked_at) VALUES('S1','16688','店铺甲','https://shop.test','{}',?)",
    )
    .bind(now)
    .run();
  // S2 has failed for 30 days; S3 collects fine but has nothing comparable.
  await db
    .prepare(
      "INSERT INTO shops(id,platform,name,url,data,status,checked_at) VALUES('S2','16688','店铺乙','https://shop2.test','{}','failed',?),('S3','16688','店铺丙','https://shop3.test','{}','ok',?)",
    )
    .bind(new Date(Date.now() - 30 * 86400000).toISOString(), now)
    .run();
  for (const id of ["active", "expired", "soldout", "empty"]) {
    await db
      .prepare("INSERT INTO products VALUES(?,'gpt',?)")
      .bind(
        id,
        JSON.stringify({
          id,
          name: id === "active" ? name : id,
          category: "gpt",
          spec: "30 天",
          channel: "直充",
        }),
      )
      .run();
    if (id === "empty") continue;
    const quote = {
      id: `q-${id}`,
      sku: id,
      shop_id: "S1",
      item_name: "月卡",
      price: 100,
      currency: "CNY",
      collection_status: "ok",
      listing_status: "listed",
      stock_status: id === "soldout" ? "sold_out" : "in_stock",
      availability: "ready",
      checked_at: id === "expired" ? "2020-01-01T00:00:00Z" : now,
    };
    await db
      .prepare("INSERT INTO quotes VALUES(?,'S1',?,?)")
      .bind(quote.id, id, JSON.stringify(quote))
      .run();
  }
});
after(async () => mf?.dispose());
test("production aliases redirect pages while preserving paths and leave API requests in place", async () => {
  for (const host of ["alias.test", "worker.test"]) {
    const response = await mf.dispatchFetch(`https://${host}/shops/S1?from=old`, { redirect: "manual" });
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://canonical.test/shops/S1?from=old");
    const api = await mf.dispatchFetch(`https://${host}/api/products`, { redirect: "manual" });
    assert.equal(api.status, 200);
  }
});
test("every public page renders readable HTML, unique metadata, canonical, OG and public cache", async () => {
  for (const [path, text] of [
    ["/", "订阅之前"],
    ["/c/gpt", "ChatGPT 订阅价格对比"],
    ["/sku/active", "当前最低价：¥100"],
    ["/shops", "店铺目录"],
    ["/shops/S1", "店铺甲"],
  ]) {
    const response = await call(path);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=300");
    assert.ok(html.includes(text));
    assert.ok(html.includes(`href="https://example.test${path}"`));
    assert.match(html, /<meta property="og:title"/);
    assert.equal((html.match(/name="description"/g) || []).length, 1);
    const bootstrap = JSON.parse(
      html.match(/id="initial-data">(.*?)<\/script>/s)![1],
    );
    assert.equal(bootstrap["/api/products"].products.length, 4);
    if (path === "/sku/active")
      assert.equal(bootstrap["/api/products/active"].quotes.length, 1);
    if (path === "/shops/S1") assert.ok(bootstrap["/api/shops/S1"]);
  }
});
test("Product AggregateOffer uses only active quotes and omits expired, sold-out and absent offers", async () => {
  assert.equal(
    schema(await (await call("/sku/active")).text()).offers.lowPrice,
    100,
  );
  for (const id of ["expired", "soldout", "empty"]) {
    const html = await (await call(`/sku/${id}`)).text();
    assert.equal(schema(html).offers, undefined);
    assert.ok(html.includes("暂无有效报价"));
  }
});
test("missing SKU, shop and category return real 404 for GET and HEAD", async () => {
  for (const path of ["/sku/missing", "/shops/missing", "/c/missing"]) {
    const response = await call(path);
    assert.equal(response.status, 404);
    assert.match(await response.text(), /页面不存在/);
    const head = await call(path, "HEAD");
    assert.equal(head.status, 404);
    assert.equal(await head.text(), "");
  }
});
test("unknown paths return the app shell with 404; client pages stay 200", async () => {
  for (const path of ["/nonexistent", "/sku/a/b", "/admin/unknown"]) {
    const response = await call(path);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
    assert.match(await response.text(), /<div id="root">/);
  }
  for (const path of ["/search", "/about", "/submit", "/admin", "/admin/reviews"])
    assert.equal((await call(path)).status, 200);
});
test("sitemap lists canonical products, categories and shops with observed lastmod; robots excludes private routes", async () => {
  const response = await call("/sitemap.xml");
  const xml = await response.text();
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=3600");
  for (const path of ["/sku/active", "/c/gpt", "/shops/S1", "/shops"])
    assert.ok(xml.includes(`https://example.test${path}</loc>`));
  assert.match(xml, /<lastmod>\d{4}-/);
  assert.ok(!xml.includes("/admin"));
  const robots = await (await call("/robots.txt")).text();
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: https:\/\/example.test\/sitemap.xml/);
});
test("stale and quote-less shops stay reachable but leave the directory, sitemap and index", async () => {
  const { shops } = (await (await call("/api/shops")).json()) as {
    shops: { id: string; listed: boolean; active_quotes: number }[];
  };
  const byId = Object.fromEntries(shops.map((s) => [s.id, s]));
  assert.deepEqual(
    [byId.S1, byId.S2, byId.S3].map((s) => [s.listed, s.active_quotes]),
    [
      [true, 1],
      [false, 0],
      [true, 0],
    ],
  );
  const xml = await (await call("/sitemap.xml")).text();
  assert.ok(!xml.includes("/shops/S2<"));
  assert.ok(!xml.includes("/shops/S3<"));
  for (const [path, robots] of [
    ["/shops/S1", "index, follow"],
    ["/shops/S2", "noindex, nofollow"],
    ["/shops/S3", "noindex, nofollow"],
  ]) {
    const response = await call(path);
    assert.equal(response.status, 200);
    assert.ok(
      (await response.text()).includes(`<meta name="robots" content="${robots}">`),
    );
  }
});
test("untrusted HTML and script terminators are escaped in readable content and bootstrap", async () => {
  const html = await (await call("/sku/active")).text();
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(
    !safeJson({ value: "</script><script>alert(1)</script>\u2028" }).includes(
      "</script>",
    ),
  );
  assert.equal(schema(html).name, `${name} 30 天`);
});
test("legacy singular shop paths redirect to the canonical shop directory path", async () => {
  const response = await mf.dispatchFetch("https://example.test/shop/S1", {
    redirect: "manual",
  });
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("Location"),
    "https://example.test/shops/S1",
  );
});
test("private preview never embeds catalog data or public cache and blocks sitemap discovery", async () => {
  const privateMf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: await workerScript(),
      compatibilityDate: "2026-10-13",
      bindings: { PUBLIC_SITE: "false" },
      serviceBindings: { ASSETS: async () => new Response(asset) },
    }),
  );
  try {
    const page = await privateMf.dispatchFetch(
      "https://example.test/sku/active",
    );
    const html = await page.text();
    assert.equal(page.headers.get("Cache-Control"), "private, no-store");
    assert.ok(!html.includes("initial-data"));
    assert.match(html, /noindex, nofollow/);
    assert.equal(
      (await privateMf.dispatchFetch("https://example.test/sitemap.xml"))
        .status,
      404,
    );
    assert.match(
      await (
        await privateMf.dispatchFetch("https://example.test/robots.txt")
      ).text(),
      /Disallow: \//,
    );
  } finally {
    await privateMf.dispose();
  }
});

import { workerScript } from "./helpers/worker";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { fingerprint } from "../src/domain";
let mf: Miniflare;
const token = "test-only-catalog-collector-token";
const at = new Date().toISOString();
const product = {
  id: "netflix-shared-26day",
  category: "other",
  name: "Netflix 共享车位 · 26天",
  spec: "26天 · 共享车位 · 不支持电视",
  channel: "共享账号车位",
  family: "Netflix",
  brand: "netflix",
  kind: "共享席位",
};
async function ingest(extra: Record<string, unknown>, authorized = true) {
  return mf.dispatchFetch("http://catalog.test/api/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorized ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify({
      schema_version: 1,
      shops: [],
      quotes: [],
      review_items: [],
      mapping_fingerprints: {},
      ...extra,
    }),
  });
}
before(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: await workerScript(),
      compatibilityDate: "2026-10-13",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "catalog" },
      bindings: {
        PUBLIC_SITE: "true",
        COLLECTOR_INGEST_TOKEN: token,
      },
      outboundService: async () => {
        throw Error("Local imports must not contact upstream");
      },
    }),
  );
  await mf.ready;
  const db = await mf.getD1Database("DB");
  for (const file of [
    "0001_initial.sql",
    "0002_idempotent_shop_import.sql",
    "0003_external_collection.sql",
    "0005_shop_capacity_60.sql",
  ])
    await db.exec(readFileSync("migrations/" + file, "utf8"));
});
after(async () => {
  await mf?.dispose();
});
test("authenticated onboarding imports new shops, products and same numeric goods ID without collisions", async () => {
  assert.equal(
    (await ingest({ product_definitions: [product] }, false)).status,
    401,
  );
  assert.equal((await ingest({ product_definitions: [product] })).status, 200);
  for (const id of ["A_one", "A_two"]) {
    const origin = "https://" + id.slice(2) + ".test";
    const shop = {
      id,
      name: id,
      platform: "acg",
      origin,
      url: origin + "/",
      collection_status: "ok",
      checked_at: at,
      source_item_count: 1,
    };
    assert.equal((await ingest({ shops: [shop] })).status, 200);
    const raw = {
      goods_no: "N14",
      shop_no: id,
      name: "Netflix 26天车位",
      description: "共享车位，不支持电视",
    };
    const fp = await fingerprint(raw);
    const mapping = {
      shop_id: id,
      sku: product.id,
      accepted_fingerprint: fp,
      channel: product.channel,
      warranty: "仅订阅质保",
      spec_evidence: "26天共享车位",
      restriction: "不支持电视",
    };
    assert.equal(
      (
        await ingest({
          mapping_updates: [
            {
              shop_id: id,
              goods_id: "N14",
              previous_fingerprint: null,
              reviewed_at: at,
              raw,
              mapping,
            },
          ],
        })
      ).status,
      200,
    );
    const q = {
      id: id + ":N14",
      shop_id: id,
      source_goods_id: "N14",
      sku: product.id,
      item_name: raw.name,
      price: id === "A_one" ? 16 : 18,
      currency: "CNY",
      item_url: origin + "/item/14",
      checked_at: at,
      collection_status: "ok",
      listing_status: "listed",
      stock_status: "in_stock",
      stock_count: 3,
      availability: "ready",
    };
    assert.equal(
      (
        await ingest({
          shops: [shop],
          quotes: [q],
          mapping_fingerprints: { [q.id]: fp },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await ingest({
          shops: [shop],
          quotes: [{ ...q, item_url: "https://wrong.test/item/14" }],
          mapping_fingerprints: { [q.id]: fp },
        })
      ).status,
      400,
    );
  }
  const data = (await (
    await mf.dispatchFetch("http://catalog.test/api/products?category=other")
  ).json()) as {
    stats: { shops: number; quotes: number };
    products: { min_price: number; ready_shop_count: number }[];
  };
  assert.equal(data.stats.shops, 2);
  assert.equal(data.stats.quotes, 2);
  assert.equal(data.products[0].min_price, 16);
  assert.equal(data.products[0].ready_shop_count, 2);
});

test("source retirement requires evidence and cannot be undone by a later successful observation", async () => {
  const shop = {
    id: "A_closed",
    platform: "acg",
    name: "closed",
    origin: "https://closed.test",
    url: "https://closed.test/",
    collection_status: "ok",
    checked_at: at,
    source_item_count: 0,
  };
  assert.equal((await ingest({ shops: [shop] })).status, 200);
  const retired = {
    ...shop,
    collection_status: "disabled",
    attempted_at: at,
    disabled_at: at,
    disabled_reason: "店铺已关闭",
    error: "店铺已关闭",
  };
  assert.equal((await ingest({ shops: [retired] })).status, 400);
  assert.equal(
    (
      await ingest({
        shops: [
          {
            ...retired,
            closure_evidence: {
              url: shop.url,
              confirmed_at: at,
              response: "原店明确提示店铺已关闭",
            },
          },
        ],
      })
    ).status,
    200,
  );
  assert.equal((await ingest({ shops: [shop] })).status, 200);
  const db = await mf.getD1Database("DB");
  const row = await db
    .prepare("SELECT enabled,cloud_enabled,data FROM shops WHERE id=?")
    .bind(shop.id)
    .first<{ enabled: number; cloud_enabled: number; data: string }>();
  assert.equal(row!.enabled, 0);
  assert.equal(row!.cloud_enabled, 0);
  assert.equal(JSON.parse(row!.data).disabled_reason, "店铺已关闭");
});

test("a failed discovered source stays retryable without inventing a successful observation", async () => {
  const shop = {
    id: "A_pending",
    platform: "acg",
    name: "pending.test",
    origin: "https://pending.test",
    url: "https://pending.test/",
    collection_status: "failed",
    attempted_at: at,
    source_item_count: 0,
    error: "HTTP 403",
    collection_paused: true,
    pause_reason: "待人工验证",
  };
  assert.equal((await ingest({ shops: [shop] })).status, 200);
  const db = await mf.getD1Database("DB");
  const row = await db
    .prepare("SELECT enabled,status,checked_at,data FROM shops WHERE id=?")
    .bind(shop.id)
    .first<{
      enabled: number;
      status: string;
      checked_at: string | null;
      data: string;
    }>();
  assert.equal(row!.enabled, 1);
  assert.equal(row!.status, "failed");
  assert.equal(row!.checked_at, null);
  assert.equal(JSON.parse(row!.data).collection_paused, true);
});

test("Dujiao variant and Catfk quotes accept only the reviewed original product path", async () => {
  for (const variant of [true, false]) {
    const shop = variant
      ? {
          id: "A_variant",
          platform: "acg",
          name: "variant",
          origin: "https://variant.test",
          url: "https://variant.test/",
          collection_status: "ok",
          checked_at: at,
          source_item_count: 1,
        }
      : {
          id: "C_demo",
          platform: "catfk",
          name: "catfk",
          source_token: "demo",
          url: "https://catfk.com/shop/demo",
          collection_status: "ok",
          checked_at: at,
          source_item_count: 1,
        };
    assert.equal((await ingest({ shops: [shop] })).status, 200);
    const gid = variant ? "N1V9" : "Cgoods_abc123";
    const raw = {
      shop_no: shop.id,
      goods_no: gid,
      name: "Netflix 26天车位",
      description: "26天共享车位，不支持电视",
      ...(variant ? { source_path: "/products/netflix%20seat" } : {}),
    };
    const fp = await fingerprint(raw);
    const mapping = {
      shop_id: shop.id,
      sku: product.id,
      accepted_fingerprint: fp,
      channel: product.channel,
      warranty: "仅订阅质保",
      spec_evidence: "具体26天车位",
      restriction: "不支持电视",
    };
    assert.equal(
      (
        await ingest({
          mapping_updates: [
            {
              shop_id: shop.id,
              goods_id: gid,
              raw,
              mapping,
              reviewed_at: at,
              previous_fingerprint: null,
            },
          ],
        })
      ).status,
      200,
    );
    const q = {
      id: shop.id + ":" + gid,
      shop_id: shop.id,
      source_goods_id: gid,
      sku: product.id,
      price: 16,
      currency: "CNY",
      checked_at: at,
      listing_status: "listed",
      collection_status: "ok",
      stock_status: "in_stock",
      stock_count: null,
      availability: "ready",
      item_url: variant
        ? "https://variant.test/products/netflix%20seat"
        : "https://catfk.com/item/goods_abc123",
    };
    assert.equal(
      (
        await ingest({
          shops: [shop],
          quotes: [q],
          mapping_fingerprints: { [q.id]: fp },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await ingest({
          shops: [shop],
          quotes: [{ ...q, item_url: q.item_url + "/wrong" }],
          mapping_fingerprints: { [q.id]: fp },
        })
      ).status,
      400,
    );
    if (variant) {
      // A changed description sends the item back to review; its source link stays the same.
      assert.equal(
        (
          await ingest({
            shops: [shop],
            review_items: [
              {
                shop_id: shop.id,
                goods_id: gid,
                name: raw.name,
                reason: "商品标题或说明变化，需要重新审核规格",
              },
            ],
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await ingest({
            shops: [shop],
            quotes: [
              {
                ...q,
                collection_status: "needs_review",
                collection_error: "商品标题或说明变化，需要重新审核规格",
              },
            ],
            mapping_fingerprints: { [q.id]: fp },
          })
        ).status,
        200,
      );
    }
  }
});

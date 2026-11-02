import test from "node:test";
import assert from "node:assert/strict";
import { activeQuotes, quoteSummary } from "../src/catalog";
import { hasActivePrice } from "../shared/quote-eligibility";
import type { Obj } from "../src/domain";

const at = new Date().toISOString();
const q: Obj = {
  id: "A:1",
  shop_id: "A",
  shop_name: "甲店",
  platform: "16688",
  enabled: 1,
  price: 100,
  checked_at: at,
  collection_status: "ok",
  listing_status: "listed",
  stock_status: "in_stock",
  availability: "ready",
};
test("shop summary deduplicates offers and names every tied minimum shop deterministically", () => {
  const s = quoteSummary(
    [
      { ...q, id: "B:1", shop_id: "B", shop_name: "乙店" },
      q,
      { ...q, id: "A:2" },
      { ...q, id: "C:1", shop_id: "C", price: 120 },
    ],
    48,
  );
  assert.equal(s.ready_count, 4);
  assert.equal(s.ready_shop_count, 3);
  assert.equal(s.min_price, 100);
  assert.deepEqual(
    s.min_price_shops.map((x) => x.name),
    ["甲店", "乙店"],
  );
});
test("disabled, expired, review, delayed, out-of-stock and stale inventory quotes cannot win the minimum", () => {
  const invalid = [
    { enabled: 0 },
    { checked_at: "2020-01-01" },
    { collection_status: "needs_review" },
    { availability: "delayed" },
    { stock_status: "out" },
    { inventory_checked_at: "2020-01-01" },
  ];
  const s = quoteSummary(
    [
      q,
      ...invalid.map((x, i) => ({
        ...q,
        id: `bad${i}`,
        shop_id: `bad${i}`,
        price: 1,
        ...x,
      })),
    ],
    48,
  );
  assert.equal(s.min_price, 100);
  assert.equal(s.ready_shop_count, 1);
  assert.equal(s.shop_count, 6);
});
test("platform filtering and an empty eligible set keep prices and counts consistent", () => {
  const rows = [
    q,
    { ...q, id: "W:1", shop_id: "W", platform: "wzyp", price: 80 },
  ];
  assert.equal(quoteSummary(rows, 48, "16688").min_price, 100);
  assert.equal(quoteSummary(rows, 48, "wzyp").shop_count, 1);
  const empty = quoteSummary(rows, 48, "independent");
  assert.equal(empty.min_price, null);
  assert.equal(empty.ready_shop_count, 0);
  assert.deepEqual(empty.min_price_shops, []);
});

test("an expired shelf observation remains dated context without becoming an available minimum", () => {
  const old = new Date(Date.now() - 72 * 3600000).toISOString();
  const newer = new Date(Date.now() - 49 * 3600000).toISOString();
  const s = quoteSummary(
    [
      { ...q, id: "old", price: 50, checked_at: old },
      { ...q, id: "newer", shop_id: "B", price: 120, checked_at: newer },
    ],
    48,
  );
  assert.equal(s.min_price, null);
  assert.equal(s.ready_shop_count, 0);
  assert.equal(s.current_count, 0);
  assert.equal(s.last_observed_price, 120);
  assert.equal(s.last_observed_at, newer);
  assert.equal(s.recorded_platform_count, 1);
});

test("unreviewed, disabled, delisted, invalid and future records cannot supply a previous shelf price", () => {
  const s = quoteSummary(
    [
      { ...q, collection_status: "needs_review" },
      { ...q, enabled: 0 },
      { ...q, listing_status: "not_listed" },
      { ...q, checked_at: "invalid" },
      { ...q, price: 0 },
      { ...q, checked_at: new Date(Date.now() + 3600000).toISOString() },
    ],
    48,
  );
  assert.equal(s.last_observed_price, null);
  assert.equal(s.last_observed_at, null);
});

test("public offers exclude expired, inactive, failed, unlisted, restricted and invalid price records", () => {
  const invalid = [
    { enabled: 0 },
    { enabled: false },
    { enabled: undefined },
    { checked_at: "2020-01-01" },
    { inventory_checked_at: "2020-01-01" },
    { checked_at: "invalid" },
    { checked_at: new Date(Date.now() + 3600000).toISOString() },
    { collection_status: "failed" },
    { collection_status: "needs_review" },
    { collection_status: "not_listed" },
    { listing_status: "not_listed" },
    { stock_status: "out" },
    { stock_status: "unknown" },
    { availability: "delayed" },
    { price: 0 },
    { price: -1 },
    { price: NaN },
    { price: Infinity },
    { price: "100" },
  ];
  const rows = [
    q,
    ...invalid.map((change, i) => ({ ...q, id: `invalid${i}`, ...change })),
  ];
  assert.deepEqual(
    activeQuotes(rows, 48).map((row) => row.id),
    [q.id],
  );
  assert.equal(
    hasActivePrice({
      min_price: null,
      last_observed_price: 118,
      ready_shop_count: 0,
    }),
    false,
  );
  assert.equal(hasActivePrice({ min_price: 118, ready_shop_count: 0 }), false);
  assert.equal(hasActivePrice({ min_price: 0, ready_shop_count: 1 }), false);
  assert.equal(hasActivePrice({ min_price: 118, ready_shop_count: 1 }), true);
});

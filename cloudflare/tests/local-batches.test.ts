import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Small shared JS helper is also used by the Node push CLI.
import { localBatches } from "../shared/local-batches.mjs";
test("large snapshots split into bounded batches without dropping or duplicating observations", () => {
  const bundle = {
    product_definitions: [{ id: "new-product" }],
    shops: [{ id: "A" }, { id: "B" }],
    quotes: Array.from({ length: 17 }, (_, i) => ({ id: i, shop_id: "A" })),
    review_items: Array.from({ length: 53 }, (_, i) => ({
      goods_id: i,
      shop_id: "B",
    })),
    mapping_updates: [{ goods_id: "G1" }, { goods_id: "G2" }],
    mapping_fingerprints: { G1: "hash" },
  };
  const batches = localBatches(bundle);
  assert.ok(
    batches.every(
      (b: any) =>
        b.shops.length <= 1 &&
        b.quotes.length <= 5 &&
        b.review_items.length <= 20 &&
        (!b.mapping_updates?.length || !b.shops.length),
    ),
  );
  assert.deepEqual(
    batches.flatMap((b: any) => b.quotes),
    bundle.quotes,
  );
  assert.deepEqual(
    batches.flatMap((b: any) => b.review_items),
    bundle.review_items,
  );
  assert.deepEqual(
    batches.flatMap((b: any) => b.mapping_updates || []),
    bundle.mapping_updates,
  );
  assert.deepEqual(batches[0].product_definitions, bundle.product_definitions);
  assert.ok(batches.findIndex((b: any) => b.mapping_updates?.length) > 0);
  assert.throws(
    () => localBatches({ ...bundle, quotes: [{ shop_id: "unknown" }] }),
    /店铺/,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { exportableQuotes } from "../shared/export-quotes.mjs";

test("retired monitors export unlisted state to invalidate a previously fresh public offer", () => {
  const current = {
    id: "A:G1",
    source_goods_id: "G1",
    shop_id: "A",
    collection_status: "ok",
    listing_status: "listed",
  };
  const retired = {
    ...current,
    collection_status: "not_listed",
    listing_status: "not_listed",
  };
  const config = {
    mappings: { G1: { shop_id: "A" } },
    exclusions: { "A:G1": { reason: "confirmed unlisted" } },
  };
  assert.deepEqual(exportableQuotes({ quotes: [current] }, config), []);
  assert.deepEqual(exportableQuotes({ quotes: [retired] }, config), [retired]);
  assert.deepEqual(
    exportableQuotes({ quotes: [retired] }, { ...config, mappings: {} }),
    [],
  );
  assert.deepEqual(
    exportableQuotes(
      { quotes: [retired] },
      { ...config, mappings: { G1: { shop_id: "B" } } },
    ),
    [],
  );
  assert.deepEqual(
    exportableQuotes({ quotes: [current] }, { ...config, exclusions: {} }),
    [current],
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { OFFICIAL_SKUS, officialFor } from "../shared/official-prices";

test("every SKU with an official equivalent exists in the catalog", () => {
  const products = JSON.parse(
    readFileSync("../config/catalog.json", "utf8"),
  ).products.map((p: { id: string }) => p.id);
  for (const sku of OFFICIAL_SKUS) assert.ok(products.includes(sku), sku);
});

test("official comparison names the plan, US price and cheapest region", () => {
  const ref = officialFor("plus-phi")!;
  assert.equal(ref.app.id, "chatgpt");
  assert.equal(ref.plan.id, "plus-month");
  assert.equal(ref.us?.region, "us");
  assert.ok(ref.cheapest.cny <= ref.us!.cny);
  assert.equal(officialFor("plus-year-ios-365")?.plan.period, "year");
  for (const sku of ["plus-mirror-month", "codex-credits-250", "missing"])
    assert.equal(officialFor(sku), null);
});

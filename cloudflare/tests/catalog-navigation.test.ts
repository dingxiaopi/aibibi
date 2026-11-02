import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalogGroups, groupTarget } from "../web/lib/catalog-navigation";

const products = JSON.parse(
  readFileSync(new URL("../../config/catalog.json", import.meta.url), "utf8"),
).products;

test("every catalog SKU stays reachable exactly once without modifying its data", () => {
  const before = JSON.stringify(products);
  for (const category of new Set<string>(
    products.map((p: any) => p.category),
  )) {
    const groups = catalogGroups(products, category);
    const expected = products.filter((p: any) => p.category === category);
    const ids = groups.flatMap((group) => group.products.map((p) => p.id));
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual([...ids].sort(), expected.map((p: any) => p.id).sort());
    assert.ok(
      groups.every((group) => !group.id.startsWith("sku:")),
      "current catalog needs reviewed presentation groups",
    );
    for (const group of groups)
      for (const p of group.products) {
        assert.equal(
          p,
          products.find((original: any) => original.id === p.id),
        );
        assert.ok(group.labels[p.id]);
      }
  }
  assert.equal(JSON.stringify(products), before);
  const gpt = catalogGroups(products, "gpt");
  assert.equal(gpt.length, 11);
  assert.deepEqual(
    [...new Set(gpt.map((g) => g.family))],
    ["Plus", "Pro", "Go", "Team", "Codex"],
  );
});

test("type navigation preserves selected variants and falls back when a preferred SKU is absent", () => {
  const groups = catalogGroups(products, "gpt");
  const monthly = groups.find((g) => g.id === "plus-month")!;
  assert.equal(groupTarget(monthly, "plus-ios"), "plus-ios");
  assert.equal(groupTarget(monthly, "plus-year-ios-365"), "plus-phi");
  assert.deepEqual(
    monthly.products.map((p) => p.id),
    ["plus-phi", "plus-ios", "plus-card", "plus-phi-cdk-30d"],
  );
  const reduced = catalogGroups(
    products.filter((p: any) => p.id !== "plus-phi"),
    "gpt",
  );
  assert.equal(
    groupTarget(reduced.find((g) => g.id === "plus-month")!),
    "plus-ios",
  );
  const quoted = {
    ...monthly,
    products: monthly.products.map((p) => ({
      ...p,
      min_price: p.id === "plus-ios" ? 133.9 : null,
    })),
  };
  assert.equal(groupTarget(quoted), "plus-ios");
  assert.equal(groupTarget(quoted, "plus-phi"), "plus-phi");
  assert.ok(
    groups
      .find((g) => g.id === "plus-year")!
      .labels["plus-year-ios-360"].includes("360"),
  );
  assert.ok(
    groups
      .find((g) => g.id === "plus-year")!
      .labels["plus-year-ios-365"].includes("365"),
  );
});

test("unreviewed new SKUs stay separate and visible; different delivery methods remain distinguishable", () => {
  const unknown = {
    id: "future-plus",
    category: "gpt",
    family: "Plus",
    name: "Future Plus",
    min_price: 1,
  };
  const groups = catalogGroups([...products, unknown], "gpt");
  assert.equal(groups.at(-1)!.id, "sku:future-plus");
  assert.equal(groups.at(-1)!.products[0], unknown);
  const tg = catalogGroups(products, "other").filter(
    (g) => g.family === "Telegram",
  );
  assert.equal(tg.length, 2);
  assert.ok(
    tg
      .find((g) => g.id === "tg-direct")!
      .products.every((p) => p.id.startsWith("tg-premium-direct-")),
  );
  assert.ok(
    tg
      .find((g) => g.id === "tg-gift")!
      .products.every((p) => p.id.startsWith("tg-premium-gift-")),
  );
});

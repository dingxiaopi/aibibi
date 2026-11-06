import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  OFFICIAL_SKUS,
  officialFor,
  official,
  rankedPrices,
  chartPrices,
  isOldPrice,
  taxPrice,
  amountCny,
  sortedRegions,
  sortPrice,
  type OfficialPrice,
} from "../shared/official-prices";
import { officialContent } from "../src/seo/official";

test("every SKU with an official equivalent exists in the catalog", () => {
  const products = JSON.parse(
    readFileSync("../config/catalog.json", "utf8"),
  ).products.map((p: { id: string }) => p.id);
  for (const sku of OFFICIAL_SKUS) assert.ok(products.includes(sku), sku);
});

test("region price sorting uses CNY, keeps ties stable and missing/old prices last in either direction", () => {
  const rows = [
    quote({ channel: "ios", cny: 100, price: 1 }),
    quote({
      channel: "ios",
      region: "ph",
      cny: 80,
      price: 100000,
      currency: "PHP",
    }),
    quote({ channel: "ios", region: "jp", cny: 80 }),
    quote({ channel: "ios", region: "tr", cny: 1, stale: true }),
    quote({ region: "gb", cny: 1 }),
  ];
  const original = JSON.stringify(rows);
  assert.deepEqual(
    sortedRegions(rows, "ios", "asc").map((r) => r.code),
    ["ph", "jp", "us", "tr", "gb"],
  );
  assert.deepEqual(
    sortedRegions(rows, "ios", "desc").map((r) => r.code),
    ["us", "ph", "jp", "tr", "gb"],
  );
  assert.deepEqual(
    sortedRegions(rows, "region", "desc").map((r) => r.code),
    ["us", "ph", "tr", "jp", "gb"],
  );
  assert.equal(JSON.stringify(rows), original);
});

test("web sorting separates inclusive, pretax and unspecified-tax amounts", () => {
  const rows = [
    quote({ price: 20, pretax_price: 10, cny: 20 * official.fx.rates.CNY }),
    quote({
      region: "ph",
      tax: "exclusive",
      price: 8,
      cny: 8 * official.fx.rates.CNY,
    }),
    quote({ region: "tr", tax: "unknown", price: 1, cny: 1 }),
  ];
  assert.deepEqual(
    sortedRegions(rows, "web_exclusive", "asc").map((r) => r.code),
    ["ph", "us", "tr"],
  );
  assert.deepEqual(
    sortedRegions(rows, "web_inclusive", "desc").map((r) => r.code),
    ["us", "ph", "tr"],
  );
  assert.deepEqual(
    sortedRegions(rows, "web_unknown", "asc").map((r) => r.code),
    ["tr", "us", "ph"],
  );
  assert.equal(sortPrice(rows[2], "web_inclusive"), null);
});

function withPrices(rows: OfficialPrice[], run: () => void) {
  const saved = official.prices;
  official.prices = rows;
  try {
    run();
  } finally {
    official.prices = saved;
  }
}
const quote = (changes: Partial<OfficialPrice> = {}): OfficialPrice => ({
  app: "chatgpt",
  plan: "plus-month",
  region: "us",
  status: "ok",
  channel: "web",
  tax: "inclusive",
  cny: 100,
  price: 20,
  currency: "USD",
  display_price: "USD 20.00",
  observed_at: new Date().toISOString(),
  source_url:
    "https://chatgpt.com/backend-api/checkout_pricing_config/configs/US",
  ...changes,
});

test("percentage comparisons require the same channel and an explicit matching tax basis", () => {
  withPrices(
    [
      quote(),
      quote({ region: "ph", cny: 80 }),
      quote({ region: "tr", tax: "exclusive", cny: 70 }),
      quote({ region: "jp", channel: "ios", tax: "unknown", cny: 60 }),
      quote({ region: "us", channel: "ios", tax: "unknown", cny: 90 }),
    ],
    () => {
      const rows = rankedPrices("chatgpt", "plus-month", "all");
      assert.equal(rows.find((r) => r.region === "ph")?.vs_us, -20);
      assert.equal(rows.find((r) => r.region === "tr")?.vs_us, null);
      assert.equal(rows.find((r) => r.region === "jp")?.vs_us, null);
    },
  );
});

test("failed and expired observations stay readable but never win a current minimum", () => {
  const old = quote({ region: "ph", cny: 1, stale: true });
  const expired = quote({
    region: "jp",
    cny: 2,
    observed_at: new Date(Date.now() - 8 * 86400000).toISOString(),
  });
  withPrices([quote(), old, expired], () => {
    assert.equal(rankedPrices("chatgpt", "plus-month", "web").length, 1);
    const html = officialContent("/official/chatgpt");
    assert.match(html, /旧报价，不参与最低价/);
    assert.match(html, /官网直购/);
  });
  assert.ok(isOldPrice(old));
  assert.ok(isOldPrice(expired));
});

test("shop equivalence remains App Store only and SSR preserves inclusive and pretax amounts", () => {
  withPrices(
    [
      quote({ channel: "ios", tax: "unknown", cny: 110 }),
      quote({ channel: "ios", tax: "unknown", region: "ph", cny: 100 }),
      quote({
        region: "ph",
        cny: 1,
        price: 1100,
        pretax_price: 982.14,
        tax_percent: 12,
        currency: "PHP",
        display_price: "PHP 1,100.00",
      }),
    ],
    () => {
      const ref = officialFor("plus-phi")!;
      assert.equal(ref.cheapest.channel, "ios");
      assert.equal(ref.cheapest.cny, 100);
      const html = officialContent("/official/chatgpt");
      assert.match(html, /含税：PHP 1,100/);
      assert.match(html, /未税：PHP 982\.14/);
      assert.match(html, /税率 12%/);
      const firstTable = html.split("</table>")[0];
      assert.equal((firstTable.match(/scope="row">菲律宾/g) || []).length, 1);
    },
  );
});

test("tax display uses both published amounts without inferring an unpublished tax", () => {
  const row = quote({ price: 1100, pretax_price: 982.14, currency: "PHP" });
  assert.equal(taxPrice(row, "inclusive"), 1100);
  assert.equal(taxPrice(row, "exclusive"), 982.14);
  assert.equal(
    amountCny(row, 982.14),
    Math.round((982.14 / official.fx.rates.PHP) * official.fx.rates.CNY * 100) /
      100,
  );
  const exclusive = quote({ tax: "exclusive", tax_percent: 12 });
  assert.equal(taxPrice(exclusive, "inclusive"), undefined);
  const unknown = quote({ tax: "unknown", tax_percent: 12 });
  assert.equal(taxPrice(unknown, "exclusive"), undefined);
  assert.equal(taxPrice(unknown, "inclusive"), undefined);
});

test("official comparison names the plan, US price and cheapest region", () => {
  withPrices(
    [
      quote({ channel: "ios" }),
      quote({ channel: "ios", region: "ph", cny: 80 }),
      quote({ channel: "ios", plan: "plus-year" }),
    ],
    () => {
      const ref = officialFor("plus-phi")!;
      assert.equal(ref.app.id, "chatgpt");
      assert.equal(ref.plan.id, "plus-month");
      assert.equal(ref.us?.region, "us");
      assert.ok(ref.cheapest.cny <= ref.us!.cny);
      assert.equal(officialFor("plus-year-ios-365")?.plan.period, "year");
      for (const sku of ["plus-mirror-month", "codex-credits-250", "missing"])
        assert.equal(officialFor(sku), null);
    },
  );
});

test("chartPrices sorts each of the 3 channels low-to-high and falls back to web_unknown when web tax is unspecified", () => {
  withPrices(
    [
      quote({ channel: "ios", region: "us", tax: "unknown", price: 20, cny: 140 }),
      quote({ channel: "ios", region: "ph", tax: "unknown", price: 999, cny: 105 }),
      quote({
        channel: "web",
        region: "us",
        tax: "exclusive",
        price: 20,
        cny: 20 * official.fx.rates.CNY,
      }),
      quote({
        channel: "web",
        region: "ph",
        tax: "inclusive",
        price: 1100,
        pretax_price: 982.14,
        currency: "PHP",
        cny: Math.round((1100 / official.fx.rates.PHP) * official.fx.rates.CNY * 100) / 100,
      }),
      quote({
        app: "gemini",
        plan: "pro-month",
        channel: "web",
        region: "us",
        tax: "unknown",
        price: 19.99,
        cny: 140,
      }),
      quote({
        app: "gemini",
        plan: "pro-month",
        channel: "web",
        region: "eg",
        tax: "unknown",
        price: 939.99,
        cny: 113,
      }),
    ],
    () => {
      const ios = chartPrices("chatgpt", "plus-month", "ios");
      assert.deepEqual(ios.rows.map((r) => r.region), ["ph", "us"]);
      assert.equal(ios.fallback_unknown, false);

      const webInc = chartPrices("chatgpt", "plus-month", "web_inclusive");
      assert.deepEqual(webInc.rows.map((r) => r.region), ["ph"]);
      assert.equal(webInc.rows[0].amount, 1100);

      const webExc = chartPrices("chatgpt", "plus-month", "web_exclusive");
      assert.deepEqual(webExc.rows.map((r) => r.region), ["ph", "us"]);
      assert.equal(webExc.rows[0].amount, 982.14);

      const geminiWeb = chartPrices("gemini", "pro-month", "web_inclusive");
      assert.equal(geminiWeb.fallback_unknown, true);
      assert.equal(geminiWeb.label, "官网标价");
      assert.deepEqual(geminiWeb.rows.map((r) => r.region), ["eg", "us"]);
    },
  );
});

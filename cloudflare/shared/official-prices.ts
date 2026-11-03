import data from "./official-prices.json";
import { SITE_NAME } from "./site";

export type OfficialChannel = "ios" | "web" | "google_play";
export type ChannelFilter = OfficialChannel | "all";
export type TaxBasis = "inclusive" | "exclusive" | "unknown";
export const CHANNEL_NAMES: Record<OfficialChannel, string> = {
  ios: "App Store",
  web: "官网直购",
  google_play: "Google Play",
};
export const TAX_NAMES: Record<TaxBasis, string> = {
  inclusive: "含税",
  exclusive: "未税 · 结账可能加税",
  unknown: "标价 · 税费以结账为准",
};
/** Written by `python3 -m collector.official_prices`; direct official sources only. */
export type OfficialPrice = {
  app: string;
  plan: string;
  region: string;
  status: "ok" | "missing" | "review";
  source_url: string;
  price?: number;
  currency?: string;
  display_price?: string;
  cny?: number;
  usd?: number;
  channel?: OfficialChannel;
  tax?: TaxBasis;
  pretax_price?: number;
  tax_percent?: number;
  observed_at?: string;
  attempted_at?: string;
  stale?: boolean;
  error?: string;
};
export type OfficialPlan = {
  app: string;
  id: string;
  label: string;
  period: "month" | "year";
};
export type OfficialRegion = { code: string; name: string; currency: string };
export type OfficialApp = {
  id: string;
  name: string;
  provider: string;
  app_store_id: string;
};
export type OfficialData = {
  collected_at: string;
  source: string;
  fx: { source: string; updated_at: string; rates: Record<string, number> };
  apps: OfficialApp[];
  plans: OfficialPlan[];
  regions: OfficialRegion[];
  prices: OfficialPrice[];
  failures: {
    app: string;
    region: string;
    channel?: OfficialChannel;
    attempted_at?: string;
    error: string;
  }[];
};

export const official = data as OfficialData;
export const priceChannel = (row: OfficialPrice) => row.channel || "ios";
export const priceTax = (row: OfficialPrice) => row.tax || "unknown";
/** Return only an explicitly published amount; never reverse-calculate a tax. */
export function taxPrice(row: OfficialPrice, basis: TaxBasis) {
  if (priceTax(row) === basis) return row.price;
  return basis === "exclusive" ? row.pretax_price : undefined;
}
export function amountCny(row: OfficialPrice, amount: number) {
  if (amount === row.price && row.cny != null) return row.cny;
  const rate = official.fx.rates[row.currency || ""];
  const cnyRate = official.fx.rates.CNY;
  return rate > 0 && cnyRate > 0
    ? Math.round((amount / rate) * cnyRate * 100) / 100
    : null;
}
export const observedAt = (row: OfficialPrice) =>
  row.observed_at || official.collected_at;
export const isOldPrice = (row: OfficialPrice, now = Date.now()) =>
  Boolean(row.stale) ||
  !Number.isFinite(Date.parse(observedAt(row))) ||
  Date.parse(observedAt(row)) > now + 60000 ||
  now - Date.parse(observedAt(row)) > 7 * 86400000;
export function priceRows(
  app: string,
  plan: string,
  channel: ChannelFilter = "all",
) {
  return official.prices.filter(
    (p) =>
      p.app === app &&
      p.plan === plan &&
      p.status === "ok" &&
      p.cny != null &&
      (channel === "all" || priceChannel(p) === channel),
  );
}
export type OfficialSort =
  "region" | "ios" | "web_inclusive" | "web_exclusive" | "web_unknown";
export function sortPrice(
  row: OfficialPrice,
  sort: OfficialSort,
): number | null {
  if (row.status !== "ok" || isOldPrice(row)) return null;
  if (sort === "ios")
    return priceChannel(row) === "ios" && Number.isFinite(row.cny)
      ? row.cny!
      : null;
  if (priceChannel(row) !== "web" || sort === "region") return null;
  const basis =
    sort === "web_inclusive"
      ? "inclusive"
      : sort === "web_exclusive"
        ? "exclusive"
        : "unknown";
  const amount = taxPrice(row, basis);
  const value = amount == null ? null : amountCny(row, amount);
  return value != null && Number.isFinite(value) ? value : null;
}
/** A missing/expired sort price stays last in either direction. Equal prices retain region order. */
export function sortedRegions(
  rows: OfficialPrice[],
  sort: OfficialSort,
  direction: "asc" | "desc",
) {
  const regions = official.regions.filter((region) =>
    rows.some((r) => r.region === region.code),
  );
  if (sort === "region") return regions;
  const values = new Map(
    regions.map((region) => {
      const value =
        rows
          .filter((r) => r.region === region.code)
          .map((r) => sortPrice(r, sort))
          .find((v) => v != null) ?? null;
      return [region.code, value] as const;
    }),
  );
  return [...regions].sort((a, b) => {
    const av = values.get(a.code),
      bv = values.get(b.code);
    if (av == null) return bv == null ? 0 : 1;
    if (bv == null) return -1;
    return direction === "asc" ? av - bv : bv - av;
  });
}
/** Catalog category / brand icon for each app. */
export const OFFICIAL_CATEGORY: Record<string, string> = {
  chatgpt: "gpt",
  claude: "claude",
  gemini: "gemini",
  grok: "grok",
};
/** Shown under the source line when an app's App Store lineup differs from its website. */
export const OFFICIAL_NOTES: Record<string, string> = {
  grok: "xAI 已在官网推出新的 X Subscription（Plus、Premium、Super、Ultra 四档）；App Store 目前仍出售旧版 SuperGrok 套餐，下列价格为 App Store 价格。",
};
/** The plan most people compare first. */
export const HEADLINE_PLAN: Record<string, string> = {
  chatgpt: "plus-month",
  claude: "pro-month",
  gemini: "pro-month",
  grok: "super-month",
};

export const officialApp = (id: string) =>
  official.apps.find((app) => app.id === id);
export const officialPlans = (app: string) =>
  official.plans.filter((plan) => plan.app === app);
export const regionName = (code: string) =>
  official.regions.find((region) => region.code === code)?.name || code;

export type RankedPrice = OfficialPrice & {
  cny: number;
  /** Percentage against the US storefront; negative is cheaper. */
  vs_us: number | null;
};
/** Matched prices of one plan, cheapest first. */
export function rankedPrices(
  app: string,
  plan: string,
  channel: ChannelFilter = "ios",
): RankedPrice[] {
  const rows = priceRows(app, plan, channel).filter(
    (p): p is OfficialPrice & { cny: number } =>
      !isOldPrice(p) && p.cny != null,
  );
  return rows
    .map((p) => {
      const us =
        priceTax(p) !== "unknown"
          ? rows.find(
              (r) =>
                r.region === "us" &&
                priceChannel(r) === priceChannel(p) &&
                priceTax(r) === priceTax(p),
            )?.cny
          : null;
      return { ...p, vs_us: us ? Math.round((p.cny / us - 1) * 100) : null };
    })
    .sort((a, b) => a.cny - b.cny);
}
/** Regions whose store page was unavailable for this app (e.g. not listed there). */
export const unavailableRegions = (app: string) =>
  official.failures
    .filter(
      (f) =>
        f.app === app &&
        ((f as { channel?: string }).channel || "ios") === "ios",
    )
    .map((f) => f.region);
/** Title/description for /official pages; null when the path is not one. */
export function officialMeta(pathname: string) {
  const regions = official.regions.length;
  if (pathname === "/official")
    return {
      title: `AI 订阅官方价格 · 官网与 App Store 各地区价格对比 · ${SITE_NAME}`,
      description: `ChatGPT、Claude、Gemini、Grok 在 ${regions} 个地区的官方订阅报价，区分官网与 App Store、含税与未税价格，附官方来源和真实采集时间。`,
    };
  const app = pathname.startsWith("/official/")
    ? officialApp(pathname.slice(10))
    : undefined;
  if (!app) return null;
  const plans = officialPlans(app.id);
  const headline = plans.find((p) => p.id === HEADLINE_PLAN[app.id])!;
  // The headline plan leads the title; it is what most people search for.
  const monthly = plans.filter((p) => p.period === "month");
  const titled = [headline, ...monthly.filter((p) => p !== headline)];
  return {
    title: `${app.name} 官方价格 · ${titled
      .slice(0, 3)
      .map((p) => p.label)
      .join(" / ")} 官网与 App Store 价格对比 · ${SITE_NAME}`,
    description: `${plans.map((p) => p.label).join("、")} 在 ${regions} 个地区的官网与 App Store 官方报价，分渠道、税费口径展示，附官方依据及更新时间。`,
  };
}
export const cny = (value: number) =>
  `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;

/**
 * Catalog SKUs that sell the same plan and billing period as an App Store plan.
 * Listed by hand: mirrors, shared seats, credits, promotional links and plans
 * whose period or tier is unclear have no official equivalent.
 */
const EQUIVALENT: Record<string, string[]> = {
  "chatgpt/go-month": ["go-phi", "go-card"],
  "chatgpt/plus-month": [
    "plus-phi",
    "plus-ios",
    "plus-card",
    "plus-account-phi-month",
    "plus-account-vn-month",
    "plus-account-jp-month",
    "plus-account-ios-month",
  ],
  "chatgpt/plus-year": ["plus-year-ios-365", "plus-year-ios-360"],
  "chatgpt/pro100-month": [
    "pro100-ios",
    "pro100-card",
    "pro100-chile",
    "pro100-phi",
  ],
  "chatgpt/pro200-month": [
    "pro200-phi",
    "pro200-phi-renewal",
    "pro200-card",
    "pro200-ios",
  ],
  "chatgpt/pro500-month": ["pro500-ios", "pro500-phi"],
  "claude/pro-month": [
    "claude-ios",
    "claude-pro-account-month",
    "claude-pro-self-month",
  ],
  "claude/max5-month": [
    "claude-max5-ios",
    "claude-max5-us-card",
    "claude-max5-card-month",
    "claude-max5-self-month",
    "claude-max5-account-ios",
  ],
  "claude/max20-month": ["claude-max20-card", "claude-max20-self-month"],
  "grok/super-month": [
    "grok-ios",
    "grok-super-legacy-ios",
    "grok-super-card-month",
  ],
};
export const OFFICIAL_SKUS = Object.values(EQUIVALENT).flat();
const OFFICIAL_BY_SKU = new Map(
  Object.entries(EQUIVALENT).flatMap(([ref, skus]) =>
    skus.map((sku) => [sku, ref.split("/")] as const),
  ),
);

/** The US and cheapest App Store price of the plan a catalog SKU sells, if any. */
export function officialFor(sku: string) {
  const [appId, planId] = OFFICIAL_BY_SKU.get(sku) || [];
  const app = appId && officialApp(appId);
  const plan = official.plans.find((p) => p.app === appId && p.id === planId);
  const prices = app && plan ? rankedPrices(app.id, plan.id) : [];
  if (!app || !plan || !prices.length) return null;
  return {
    app,
    plan,
    us: prices.find((p) => p.region === "us") || null,
    cheapest: prices[0],
    regions: prices.length,
  };
}

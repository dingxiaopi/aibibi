import data from "./official-prices.json";
import { SITE_NAME } from "./site";

/** Written by `python3 -m collector.official_prices`; App Store in-app prices per storefront. */
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
  failures: { app: string; region: string; error: string }[];
};

export const official = data as OfficialData;
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
export function rankedPrices(app: string, plan: string): RankedPrice[] {
  const rows = official.prices.filter(
    (p): p is OfficialPrice & { cny: number } =>
      p.app === app && p.plan === plan && p.status === "ok" && p.cny != null,
  );
  const us = rows.find((p) => p.region === "us")?.cny;
  return rows
    .map((p) => ({
      ...p,
      vs_us: us ? Math.round((p.cny / us - 1) * 100) : null,
    }))
    .sort((a, b) => a.cny - b.cny);
}
/** Regions whose store page was unavailable for this app (e.g. not listed there). */
export const unavailableRegions = (app: string) =>
  official.failures.filter((f) => f.app === app).map((f) => f.region);
/** Title/description for /official pages; null when the path is not one. */
export function officialMeta(pathname: string) {
  const regions = official.regions.length;
  if (pathname === "/official")
    return {
      title: `AI 订阅官方价格 · ChatGPT / Claude / Gemini / Grok 各国 App Store 价格对比 · ${SITE_NAME}`,
      description: `ChatGPT Plus、Claude Pro、Google AI Pro、SuperGrok 在美国、菲律宾、土耳其、日本等 ${regions} 个地区 App Store 的官方订阅价格，统一换算人民币，看哪个地区最便宜。`,
    };
  const app = pathname.startsWith("/official/")
    ? officialApp(pathname.slice(10))
    : undefined;
  if (!app) return null;
  const plans = officialPlans(app.id);
  const headline = plans.find((p) => p.id === HEADLINE_PLAN[app.id])!;
  const cheapest = rankedPrices(app.id, headline.id)[0];
  // The headline plan leads the title; it is what most people search for.
  const monthly = plans.filter((p) => p.period === "month");
  const titled = [headline, ...monthly.filter((p) => p !== headline)];
  return {
    title: `${app.name} 官方价格 · ${titled
      .slice(0, 3)
      .map((p) => p.label)
      .join(" / ")} 各国 App Store 价格对比 · ${SITE_NAME}`,
    description: `${plans.map((p) => p.label).join("、")} 在 ${regions} 个地区 App Store 的官方价格，换算人民币排名${cheapest ? `；${headline.label} 最便宜是${regionName(cheapest.region)}区，约 ${cny(cheapest.cny)}/月` : ""}。`,
  };
}
export const cny = (value: number) =>
  `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: value < 100 ? 2 : 0 })}`;

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

import {
  operationsSelectQuotes,
  coverageCandidatesSelectQuotes,
} from "./repo/quotes";
import {
  coverageSelectProducts,
  coverageCandidatesSelectProducts,
} from "./repo/products";
import {
  coverageSelectGoods,
  coverageCandidatesSelectGoods,
} from "./repo/goods";
import { collectionStatusSelectShops } from "./repo/shops";
import { collectionStatusSelectLocalTransfers } from "./repo/local_transfers";
import { json } from "./auth";
import { fresh, obj, text, type Obj } from "./domain";
import { quoteSummary } from "./catalog";

export function coverageRows(products: Obj[], quotes: Obj[], hours: number) {
  const bySku = new Map<string, Obj[]>();
  for (const quote of quotes) {
    const key = text(quote.sku);
    if (!bySku.has(key)) bySku.set(key, []);
    bySku.get(key)!.push(quote);
  }
  return products.map((p) => {
    const all = bySku.get(text(p.id)) || [];
    const active = all.filter((q) => q.enabled);
    const summary = quoteSummary(all, hours);
    return {
      ...p,
      ...summary,
      gap:
        summary.ready_shop_count === 0
          ? "empty"
          : summary.ready_shop_count === 1
            ? "single"
            : "compared",
      blockers: {
        paused: all.filter((q) => !q.enabled).length,
        expired: active.filter(
          (q) =>
            q.collection_status === "ok" &&
            q.listing_status === "listed" &&
            !fresh(q, hours),
        ).length,
        failed: active.filter((q) => q.collection_status === "failed").length,
        review: active.filter((q) => q.collection_status === "needs_review")
          .length,
        missing: active.filter(
          (q) =>
            q.collection_status === "not_listed" ||
            q.listing_status === "not_listed",
        ).length,
        out: active.filter((q) => fresh(q, hours) && q.stock_status === "out")
          .length,
        delayed: active.filter(
          (q) => fresh(q, hours) && q.availability === "delayed",
        ).length,
        unknown: active.filter(
          (q) =>
            fresh(q, hours) &&
            (q.stock_status === "unknown" || q.availability === "unknown"),
        ).length,
      },
    };
  });
}
const quoteRows = async (env: Env): Promise<Obj[]> =>
  (
    await operationsSelectQuotes(env).all<{
      data: string;
      enabled: number;
      shop_name: string;
      platform: string;
    }>()
  ).results.map((r) => ({
    ...obj(JSON.parse(r.data)),
    enabled: r.enabled,
    shop_name: r.shop_name,
    platform: r.platform,
  }));

export async function coverage(env: Env, hours: number) {
  const products = await coverageSelectProducts(env).all<{ data: string }>();
  const rows = coverageRows(
    products.results.map((r) => obj(JSON.parse(r.data))),
    await quoteRows(env),
    hours,
  );
  const pending = await coverageSelectGoods(env).first<{ n: number }>();
  return json({
    at: new Date().toISOString(),
    hours,
    summary: {
      products: rows.length,
      empty: rows.filter((p) => p.gap === "empty").length,
      single: rows.filter((p) => p.gap === "single").length,
      compared: rows.filter((p) => p.gap === "compared").length,
      pending: pending?.n || 0,
    },
    products: rows,
  });
}

/** Only title hints; terms deliberately do not assert channel, region, term or stock. */
export function candidateTerms(product: Obj) {
  const name = text(product.name).toLowerCase();
  const category = text(product.category);
  let brands: string[];
  if (category === "gpt")
    brands = name.includes("codex") ? ["codex"] : ["chatgpt", "gpt"];
  else if (category === "claude") brands = ["claude", "克劳德"];
  else if (category === "grok") brands = ["grok"];
  else if (category === "gemini") brands = ["gemini", "谷歌ai", "google ai"];
  else if (category === "cursor") brands = ["cursor"];
  else if (name.includes("小蓝")) brands = ["小蓝"];
  else if (name.includes("icloud")) brands = ["icloud"];
  else if (name.includes("hotmail")) brands = ["hotmail"];
  else if (name.includes("outlook")) brands = ["outlook"];
  else if (product.brand === "x") brands = ["twitter", "推特", "premium"];
  else if (product.brand === "telegram")
    brands = ["telegram", "电报", "tg会员", "tg premium"];
  else if (product.brand === "apple") brands = ["apple", "苹果"];
  else
    brands = [text(product.brand) || name.split(/[\s·]/)[0]].filter(
      (v) => v.length >= 3,
    );
  const tier = ["plus", "ultra", "max", "pro", "go", "team"].find((v) =>
    new RegExp(`\\b${v}\\b`).test(name),
  );
  return {
    brands,
    tier: ["gpt", "claude", "grok", "gemini", "cursor"].includes(category)
      ? tier || null
      : null,
  };
}
export async function coverageCandidates(env: Env, url: URL) {
  const sku = url.searchParams.get("sku") || "";
  const row = await coverageCandidatesSelectProducts(env)
    .bind(sku)
    .first<{ data: string }>();
  if (!row) return json({ error: "规格不存在" }, 404);
  const terms = candidateTerms(obj(JSON.parse(row.data)));
  if (!terms.brands.length)
    return json({ items: [], terms, total: 0, offset: 0 });
  const offset = Math.max(
    0,
    Math.min(100000, Math.trunc(Number(url.searchParams.get("offset")) || 0)),
  );
  const matching = terms.brands
    .map(() => "instr(lower(g.title),?)>0")
    .join(" OR ");
  const where = `g.review_status='pending' AND s.enabled=1 AND (${matching})${terms.tier ? " AND instr(lower(g.title),?)>0" : ""}`;
  const values = [...terms.brands, ...(terms.tier ? [terms.tier] : [])];
  const total = await coverageCandidatesSelectGoods(env, where)
    .bind(...values)
    .first<{ n: number }>();
  const result = await coverageCandidatesSelectQuotes(env, where)
    .bind(sku, ...values, offset)
    .all<Obj>();
  return json({ items: result.results, terms, total: total?.n || 0, offset });
}

export function quoteHealth(quotes: Obj[], hours: number) {
  const active = quotes.filter((q) => q.enabled);
  return {
    total: active.length,
    ready: quoteSummary(quotes, hours).ready_count,
    expired: active.filter(
      (q) =>
        q.collection_status === "ok" &&
        q.listing_status === "listed" &&
        !fresh(q, hours),
    ).length,
    expiring: active.filter(
      (q) =>
        fresh(q, hours) &&
        Math.min(
          Date.parse(text(q.checked_at)),
          Date.parse(text(q.inventory_checked_at || q.checked_at)),
        ) +
          hours * 3600000 <=
          Date.now() + 12 * 3600000,
    ).length,
    failed: active.filter((q) => q.collection_status === "failed").length,
    review: active.filter((q) => q.collection_status === "needs_review").length,
  };
}
export async function collectionStatus(env: Env, hours: number) {
  const qs = await quoteRows(env);
  const shops = await collectionStatusSelectShops(env).all<Obj>();
  const transfers = await collectionStatusSelectLocalTransfers(env).all<Obj>();
  return json({
    at: new Date().toISOString(),
    hours,
    health: quoteHealth(qs, hours),
    shops: shops.results.map((s) => ({
      id: s.id,
      name: s.name,
      platform: s.platform,
      enabled: Boolean(s.enabled),
      status: s.status,
      checked_at: s.checked_at,
      error: s.error,
      attempted_at: obj(JSON.parse(text(s.data))).attempted_at || s.checked_at,
      source_items: obj(JSON.parse(text(s.data))).source_item_count || 0,
      ...quoteHealth(
        qs.filter((q) => q.shop_id === s.id),
        hours,
      ),
    })),
    transfers: transfers.results.map((t) => ({
      ...t,
      counts: JSON.parse(text(t.counts)),
    })),
  });
}

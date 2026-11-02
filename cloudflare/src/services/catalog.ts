import { publicShopsSelectShops } from "../repo/shops";
import { quoteListSelectQuotes } from "../repo/quotes";
import { obj, text, type Obj, type Shop } from "../domain";
import { shopListed } from "../../shared/shop-visibility";

import { activeQuotes, quoteSummary } from "../catalog";
import { publicData, publicShop, type PublicContext } from "./public-data";
import type {
  Quote,
  QuoteSummary,
  Shop as PublicShop,
  ProductsResponse,
} from "../../shared/api-types";
export async function publicShops(env: Env): Promise<PublicShop[]> {
  const rows = await publicShopsSelectShops(env).all<Shop>();
  return rows.results.map(publicShop);
}
/** Public directory fields: whether the shop is listed and how many live quotes it has. */
export function withVisibility(
  shops: PublicShop[],
  quotes: Obj[],
  categoryBySku = new Map<string, string>(),
) {
  const counts = new Map<string, number>();
  const brands = new Map<string, Set<string>>();
  for (const q of quotes) {
    counts.set(text(q.shop_id), (counts.get(text(q.shop_id)) || 0) + 1);
    const category = categoryBySku.get(text(q.sku));
    if (category) {
      const set = brands.get(text(q.shop_id)) || new Set<string>();
      set.add(category);
      brands.set(text(q.shop_id), set);
    }
  }
  return shops.map((shop) => ({
    ...shop,
    listed: shopListed(shop),
    active_quotes: counts.get(shop.id) || 0,
    categories: [...(brands.get(shop.id) || [])].sort(),
  }));
}
export async function quoteList(
  env: Env,
  where: string,
  values: string[],
): Promise<Quote[]> {
  const r = await quoteListSelectQuotes(env, where)
    .bind(...values)
    .all<{
      data: string;
      shop_name: string;
      platform: string;
      enabled: number;
    }>();
  return r.results.map((r) => ({
    ...(obj(JSON.parse(r.data)) as Quote),
    shop_name: r.shop_name,
    platform: r.platform,
    enabled: r.enabled,
  }));
}
export async function products(
  env: Env,
  url: URL,
  hours: number,
  context: PublicContext = {},
): Promise<ProductsResponse> {
  const data = await publicData(env, context);
  const qs = data.quotes;
  const publicQuotes = activeQuotes(qs, hours);
  const bySku = new Map<string, Quote[]>();
  for (const quote of qs) {
    const group = bySku.get(quote.sku) || [];
    group.push(quote);
    bySku.set(quote.sku, group);
  }
  const q = url.searchParams.get("q")?.slice(0, 100).toLowerCase() || "",
    category = url.searchParams.get("category") || "all",
    platform = url.searchParams.get("platform") || "all";
  return {
    settings: { freshness_hours: hours },
    stats: {
      shops: data.shops.length,
      quotes: publicQuotes.length,
      available: publicQuotes.length,
    },
    products: data.products
      .filter(
        (p) =>
          (category === "all" || p.category === category) &&
          [p.name, p.spec, ...(bySku.get(p.id) || []).map((x) => x.shop_name)]
            .join(" ")
            .toLowerCase()
            .includes(q),
      )
      .map((p) => {
        return {
          ...p,
          ...(quoteSummary(
            bySku.get(p.id) || [],
            hours,
            platform,
          ) as QuoteSummary),
        };
      }),
  };
}

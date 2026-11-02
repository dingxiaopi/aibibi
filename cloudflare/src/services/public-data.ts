import { obj, type Shop as StoredShop } from "../domain";
import type { Product, Quote, Shop } from "../../shared/api-types";
import type { Settings } from "../repo/settings";
import { catalogProducts } from "../repo/products";
import { catalogShops } from "../repo/shops";
import { catalogQuotes } from "../repo/quotes";

export interface PublicData {
  products: Product[];
  shops: Shop[];
  quotes: Quote[];
}
/** Owned by one incoming request, never reused between visitors or across writes. */
export interface PublicContext {
  settings?: Promise<Settings | null>;
  catalog?: Promise<PublicData>;
}
export function publicShop(s: StoredShop): Shop {
  return {
    ...obj(JSON.parse(s.data)),
    id: s.id,
    name: s.name,
    url: s.url,
    platform: s.platform,
    enabled: Boolean(s.enabled),
    cloud_enabled: false,
    collection_status: s.status,
    checked_at: s.checked_at,
    error: s.error,
  };
}
// Match SQLite's binary Unicode order without asking D1 to build a temporary sort.
function binaryOrder(a: string, b: string) {
  if (a === b) return 0;
  const x = [...a],
    y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const difference = x[i].codePointAt(0)! - y[i].codePointAt(0)!;
    if (difference) return difference;
  }
  return x.length - y.length;
}
export function publicData(
  env: Env,
  context: PublicContext,
): Promise<PublicData> {
  return (context.catalog ??= (async () => {
    const [ps, ss, qs] = await Promise.all([
      catalogProducts(env).all<{
        id: string;
        category: string;
        data: string;
      }>(),
      catalogShops(env).all<StoredShop>(),
      catalogQuotes(env).all<{ shop_id: string; data: string }>(),
    ]);
    const products = ps.results
      .sort(
        (a, b) =>
          binaryOrder(a.category, b.category) || binaryOrder(a.id, b.id),
      )
      .map((row) => obj(JSON.parse(row.data)) as Product);
    const shops = ss.results
      .map(publicShop)
      .sort(
        (a, b) =>
          binaryOrder(a.platform, b.platform) || binaryOrder(a.name, b.name),
      );
    const byId = new Map(shops.map((shop) => [shop.id, shop]));
    const quotes: Quote[] = [];
    for (const row of qs.results) {
      const shop = byId.get(row.shop_id);
      if (!shop) continue; // Same inner-join semantics as the indexed detail query.
      quotes.push({
        ...obj(JSON.parse(row.data)),
        shop_name: shop.name,
        platform: shop.platform,
        enabled: shop.enabled ? 1 : 0,
      } as Quote);
    }
    return { products, shops, quotes };
  })());
}

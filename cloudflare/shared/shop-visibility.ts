import type { Shop } from "./api-types";

/** A failing shop stays listed this long after its last successful collection. */
export const STALE_SHOP_DAYS = 14;

/**
 * Whether a shop appears in the public directory. Derived from collection state,
 * so a shop that recovers is listed again on its next successful collection.
 */
export function shopListed(shop: Shop, time = Date.now()) {
  if (!shop.enabled || shop.disabled_at) return false;
  if (shop.collection_status === "ok") return true;
  const last = Date.parse(shop.checked_at || "");
  return Number.isFinite(last) && time - last < STALE_SHOP_DAYS * 86400000;
}

/** Only listed shops with live quotes are worth a search engine's time. */
export const shopIndexable = (shop: Shop) =>
  Boolean(shop.listed && shop.active_quotes);

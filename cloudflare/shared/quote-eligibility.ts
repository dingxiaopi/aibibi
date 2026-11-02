type Quote = Record<string, unknown>;

/** Public offers must remain both fresh and purchasable, including inventory age. */
export function isActiveQuote(q: Quote, hours: number, time = Date.now()) {
  const priceAge = time - Date.parse(String(q.checked_at ?? ""));
  const stockAge = q.inventory_checked_at
    ? time - Date.parse(String(q.inventory_checked_at))
    : priceAge;
  return (
    (q.enabled === 1 || q.enabled === true) &&
    q.collection_status === "ok" &&
    q.listing_status === "listed" &&
    q.stock_status === "in_stock" &&
    q.availability === "ready" &&
    typeof q.price === "number" &&
    Number.isFinite(q.price) &&
    q.price > 0 &&
    priceAge >= -300000 &&
    priceAge < hours * 3600000 &&
    stockAge >= -300000 &&
    stockAge < hours * 3600000
  );
}

export function hasActivePrice(p: Record<string, unknown>) {
  return (
    typeof p.min_price === "number" &&
    Number.isFinite(p.min_price) &&
    p.min_price > 0 &&
    typeof p.ready_shop_count === "number" &&
    p.ready_shop_count > 0
  );
}

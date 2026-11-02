/** Send retirement state as well as observations, so a previous price is invalidated. */
export function exportableQuotes(snapshot, config) {
  return snapshot.quotes.filter((q) => {
    const mapping = config.mappings[q.id] || config.mappings[q.source_goods_id];
    if (mapping?.shop_id !== q.shop_id) return false;
    if (!config.exclusions?.[q.id]) return true;
    return (
      q.collection_status === "not_listed" && q.listing_status === "not_listed"
    );
  });
}

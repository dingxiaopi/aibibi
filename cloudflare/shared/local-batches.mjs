/** Bound each request's D1 queries, including the free plan's per-request limit. */
export function localBatches(bundle) {
  const base = {
    schema_version: 1,
    mapping_fingerprints:
      bundle.transfer_format === 2 ? {} : bundle.mapping_fingerprints,
  };
  const batches = (bundle.product_definitions || []).map((product) => ({
    ...base,
    shops: [],
    quotes: [],
    review_items: [],
    product_definitions: [product],
  }));
  for (const shop of bundle.shops)
    batches.push({ ...base, shops: [shop], quotes: [], review_items: [] });
  batches.push(
    ...(bundle.mapping_updates || []).map((update) => ({
      ...base,
      shops: [],
      quotes: [],
      review_items: [],
      mapping_updates: [update],
    })),
  );
  for (const shop of bundle.shops) {
    const quotes = bundle.quotes.filter((q) => q.shop_id === shop.id);
    const reviews = bundle.review_items.filter((r) => r.shop_id === shop.id);
    const count = Math.max(
      1,
      Math.ceil(quotes.length / 5),
      Math.ceil(reviews.length / 15),
    );
    for (let i = 0; i < count; i++)
      batches.push({
        ...base,
        shops: [shop],
        quotes: quotes.slice(i * 5, i * 5 + 5),
        review_items: reviews.slice(i * 15, i * 15 + 15),
      });
  }
  if (
    bundle.quotes.some((q) => !bundle.shops.some((s) => s.id === q.shop_id)) ||
    bundle.review_items.some(
      (r) => !bundle.shops.some((s) => s.id === r.shop_id),
    )
  )
    throw Error("采集包包含未登记于包内的店铺");
  // Legacy bundles retain byte-for-byte batch hashes for existing transfer receipts.
  if (bundle.transfer_format === 2) {
    for (const batch of batches) {
      for (const quote of batch.quotes) {
        const composite = quote.shop_id + ":" + quote.source_goods_id;
        const key = Object.hasOwn(bundle.mapping_fingerprints, composite)
          ? composite
          : quote.source_goods_id;
        if (Object.hasOwn(bundle.mapping_fingerprints, key))
          batch.mapping_fingerprints = {
            ...batch.mapping_fingerprints,
            [key]: bundle.mapping_fingerprints[key],
          };
      }
    }
  }
  return batches;
}

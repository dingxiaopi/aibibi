import { exportableQuotes } from "./export-quotes.mjs";

const productKeys = [
  "id",
  "category",
  "name",
  "spec",
  "channel",
  "logo",
  "brand",
  "family",
  "kind",
];
const mappingKeys = [
  "shop_id",
  "sku",
  "accepted_fingerprint",
  "channel",
  "warranty",
  "spec_evidence",
  "restriction",
];

/** Match the server's immutable-product and same-mapping comparisons. */
export function exportBundle(snapshot, config, state = null, destination = "") {
  const usable =
    state?.destination === destination &&
    destination &&
    Number.isFinite(Date.parse(state.synced_at)) &&
    Date.now() - Date.parse(state.synced_at) >= 0 &&
    Date.now() - Date.parse(state.synced_at) < 24 * 3600000;
  const products = new Map(
    (usable ? state.products || [] : []).map((p) => [p.id, p]),
  );
  const mappings = new Map(
    (usable ? state.mapping_states || [] : []).map((m) => [
      m.shop_id + ":" + m.source_id,
      m,
    ]),
  );
  return {
    schema_version: 1,
    transfer_format: 2,
    generated_at: snapshot.generated_at,
    product_definitions: config.products.filter((p) => {
      const saved = products.get(p.id);
      return (
        !saved ||
        !productKeys.every(
          (key) => String(saved[key] ?? "") === String(p[key] ?? ""),
        )
      );
    }),
    shops: snapshot.shops,
    quotes: exportableQuotes(snapshot, config),
    review_items: snapshot.review_items,
    mapping_updates: (config.mapping_updates || []).filter((u) => {
      const saved = mappings.get(u.shop_id + ":" + u.goods_id);
      let data;
      try {
        data = JSON.parse(saved?.mapping_data);
      } catch {
        return true;
      }
      if (!data || typeof data !== "object") return true;
      return (
        saved.fingerprint !== u.mapping.accepted_fingerprint ||
        !mappingKeys.every((key) => data[key] === u.mapping[key])
      );
    }),
    mapping_fingerprints: Object.fromEntries(
      Object.entries(config.mappings).map(([id, m]) => [
        id,
        m.accepted_fingerprint,
      ]),
    ),
    // The CLI refuses to accidentally send a destination-filtered bundle elsewhere.
    ...(usable ? { destination } : {}),
  };
}

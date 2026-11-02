export function exportableQuotes<T extends {
  id: string;
  source_goods_id: string;
  shop_id: string;
  collection_status: string;
  listing_status: string;
}>(snapshot: { quotes: T[] }, config: {
  mappings: Record<string, { shop_id: string }>;
  exclusions?: Record<string, unknown>;
}): T[];

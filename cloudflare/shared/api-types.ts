/** Contracts from the local API snapshot and stored, validated quote samples. */
export interface Product extends Record<string, unknown> {
  id: string;
  category: string;
  name: string;
  spec: string;
  channel: string;
  logo?: string;
  brand?: string;
  family?: string;
  kind?: string;
}
export interface MinimumPriceShop {
  id: string;
  name: string;
  quote_id: string;
  checked_at: string;
  item_url: string;
}
export interface QuoteSummary {
  current_count: number;
  ready_count: number;
  shop_count: number;
  current_shop_count: number;
  ready_shop_count: number;
  platform_count: number;
  recorded_platform_count: number;
  min_price: number | null;
  min_price_shops: MinimumPriceShop[];
  last_observed_price: number | null;
  last_observed_at: string | null;
}
export type CatalogProduct = Product & QuoteSummary;
export interface Quote extends Record<string, unknown> {
  id: string;
  source_goods_id: string;
  shop_id: string;
  sku: string;
  item_name: string;
  price: number;
  currency: string;
  price_basis?: string;
  fees?: string;
  stock_status: string;
  stock_count: number | null;
  availability: string;
  availability_note?: string;
  warranty: string;
  channel: string;
  item_url: string;
  checked_at: string;
  inventory_checked_at?: string;
  collection_status: string;
  collection_error?: string;
  listing_status: string;
  attempted_at?: string;
  source?: string;
  spec_evidence?: string;
  acquisition_method?: string;
  shop_name: string;
  platform: string;
  enabled: boolean | number;
}
export interface Shop extends Record<string, unknown> {
  id: string;
  name: string;
  url: string;
  platform: string;
  enabled: boolean;
  cloud_enabled: boolean;
  collection_status: string;
  checked_at: string | null;
  error: string | null;
  region?: string;
  attempted_at?: string;
  source_item_count?: number;
  collection_paused?: boolean;
  pause_reason?: string;
  disabled_at?: string;
  disabled_reason?: string;
  /** Public directory only: see shared/shop-visibility.ts. */
  listed?: boolean;
  active_quotes?: number;
  /** Brands represented by currently valid, reviewed quotes; never inferred from titles. */
  categories?: string[];
}
export interface Observation {
  quote_id: string;
  checked_at: string;
  price: number;
  name: string;
}
export interface ProductsResponse {
  settings: { freshness_hours: number };
  stats: { shops: number; quotes: number; available: number };
  products: CatalogProduct[];
}
export interface ProductDetailResponse {
  product: Product;
  quotes: Quote[];
  hours: number;
}
export interface ShopsResponse {
  shops: Shop[];
}
export interface ShopDetailResponse {
  shop: Shop;
  quotes: Quote[];
  /** Fresh, approved shelf records, including sold-out or unknown inventory. */
  recorded_quotes?: Quote[];
  hours: number;
}
export interface HistoryResponse {
  observations: Observation[];
}
export interface Lead {
  id: string;
  name: string;
  url: string;
  note: string;
  status: string;
  created_at: string;
}
export interface AdminDashboardResponse {
  settings: {
    auto_enabled: number;
    interval_days: number;
    freshness_hours: number;
    last_auto_at: string | null;
  };
  local_collection_only: boolean;
  shops: Shop[];
  runs: {
    id: string;
    name: string;
    status: string;
    created_at: string;
    finished_at: string | null;
    error: string | null;
  }[];
  pending: { n: number };
  leads: Lead[];
  failures: { id: string; error: string; name: string }[];
}
export interface ReviewRecord {
  id: string;
  shop_id: string;
  source_id: string;
  title: string;
  raw: string | null;
  fingerprint: string | null;
  data_at: string;
  reason: string;
  review_status: string;
  shop_name: string;
  platform: string;
  cloud_enabled: number;
}
export interface ReviewsResponse {
  items: ReviewRecord[];
  offset: number;
}

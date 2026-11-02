export const reportReasons = {
  price: "价格不符",
  stock: "已缺货",
  spec: "规格或购买条件不符",
  link: "链接失效",
  other: "其他问题",
} as const;
export type ReportReason = keyof typeof reportReasons;
export interface QuoteReport {
  id: string;
  quote_id: string;
  reason: ReportReason;
  note: string;
  snapshot: string;
  status: "pending" | "resolved" | "dismissed";
  created_at: string;
  updated_at: string;
}
export interface ReportSnapshot {
  sku: string;
  shop_id: string;
  shop_name: string;
  item_name: string;
  item_url: string;
  price: number;
  checked_at: string;
}

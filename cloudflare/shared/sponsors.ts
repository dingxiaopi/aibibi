export const sponsorSlots = ["hero", "home-inline", "detail"] as const;
export const sponsorCategories = [
  "all",
  "gpt",
  "claude",
  "gemini",
  "grok",
  "cursor",
] as const;
export type SponsorSlot = (typeof sponsorSlots)[number];
export type SponsorCategory = (typeof sponsorCategories)[number];
export type SponsorStatus = "draft" | "active" | "paused";
export const slotLabels: Record<SponsorSlot, string> = {
  hero: "A · 首页站点赞助",
  "home-inline": "B · 首页主广告",
  detail: "C · 详情合作卡片",
};
export type SponsorCreative = {
  brand: string;
  title: string;
  description: string;
  cta: string;
  target_url: string;
  logo_asset: string;
  desktop_asset: string;
  mobile_asset: string;
};
export type SponsorCampaign = SponsorCreative & {
  id: string;
  slot: SponsorSlot;
  category: SponsorCategory;
  status: SponsorStatus;
  starts_at: string;
  ends_at: string;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type PublicSponsor = Omit<
  SponsorCampaign,
  "target_url" | "status" | "created_at" | "updated_at"
> & { delivery_id: string };
export type SponsorMetric = {
  campaign_id: string;
  brand: string;
  title: string;
  slot: SponsorSlot;
  day: string;
  impressions: number;
  clicks: number;
};
export type SponsorInquiry = {
  id: string;
  brand: string;
  contact: string;
  message: string;
  slot: string;
  status: "pending" | "contacted" | "closed";
  created_at: string;
};

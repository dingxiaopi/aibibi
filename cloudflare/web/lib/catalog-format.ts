import type { Quote } from "../../shared/api-types";
import type { NavigationProduct } from "./catalog-navigation";
import { hasActivePrice, isActiveQuote } from "../../shared/quote-eligibility";

export const categories = [
  ["all", "全部"],
  ["gpt", "ChatGPT"],
  ["claude", "Claude"],
  ["grok", "Grok"],
  ["gemini", "Gemini"],
  ["cursor", "Cursor"],
  ["other", "周边"],
];

export const platformName = (p: string) =>
  (
    ({
      "16688": "16688",
      wzyp: "链动店铺",
      catfk: "Catfk",
      independent: "独立发卡站",
      acg: "独立发卡站",
    }) as Record<string, string>
  )[p] || p;

export const money = (n: number | null | undefined) =>
  Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 2 });

export const shortDate = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Singapore",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value))
    : "";

export const productPrice = (p: NavigationProduct) =>
  hasActivePrice(p) ? p.min_price : null;

export const productPriceLabel = (p: NavigationProduct) =>
  hasActivePrice(p) ? `¥${money(p.min_price)} 起` : "暂无有效报价";

export const date = (v: string | null | undefined) =>
  v
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Singapore",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(v)) + " UTC+8"
    : "尚未核验";

export const fresh = (q: Quote, hours: number) => {
  const a = Date.now() - Date.parse(q.checked_at);
  const b = q.inventory_checked_at
    ? Date.now() - Date.parse(q.inventory_checked_at)
    : a;
  return (
    q.collection_status === "ok" &&
    q.listing_status === "listed" &&
    a >= -300000 &&
    a < hours * 3600000 &&
    b >= -300000 &&
    b < hours * 3600000
  );
};

export const available = (q: Quote, hours: number) => isActiveQuote(q, hours);

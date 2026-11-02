import { fresh, text, type Obj } from "./domain";
import { isActiveQuote } from "../shared/quote-eligibility";

export const activeQuotes = (quotes: Obj[], hours: number) =>
  quotes.filter((q) => isActiveQuote(q, hours));

/** Prices and shop counts use the same enabled, platform-filtered quote set. */
export function quoteSummary(quotes: Obj[], hours: number, platform = "all") {
  const matches = quotes.filter(
    (q) => q.enabled && (platform === "all" || q.platform === platform),
  );
  const current = matches.filter((q) => fresh(q, hours));
  const ready = activeQuotes(matches, hours).sort(
    (a, b) =>
      Number(a.price) - Number(b.price) ||
      text(a.shop_id).localeCompare(text(b.shop_id)) ||
      text(a.id).localeCompare(text(b.id)),
  );
  const minimum = ready[0]?.price ?? null;
  // A dated previous shelf observation is presentation context, never a live minimum.
  const lastObserved = matches
    .filter(
      (q) =>
        q.collection_status === "ok" &&
        q.listing_status === "listed" &&
        typeof q.price === "number" &&
        Number.isFinite(q.price) &&
        q.price > 0 &&
        Number.isFinite(Date.parse(text(q.checked_at))) &&
        Date.parse(text(q.checked_at)) <= Date.now() + 300000,
    )
    .sort(
      (a, b) =>
        Date.parse(text(b.checked_at)) - Date.parse(text(a.checked_at)) ||
        Number(a.price) - Number(b.price) ||
        text(a.id).localeCompare(text(b.id)),
    )[0];
  const best = [
    ...new Map(
      ready
        .filter((q) => q.price === minimum)
        .map((q) => [
          text(q.shop_id),
          {
            id: q.shop_id,
            name: q.shop_name,
            quote_id: q.id,
            checked_at: q.checked_at,
            item_url: q.item_url,
          },
        ]),
    ).values(),
  ];
  return {
    current_count: current.length,
    ready_count: ready.length,
    shop_count: new Set(matches.map((q) => q.shop_id)).size,
    current_shop_count: new Set(current.map((q) => q.shop_id)).size,
    ready_shop_count: new Set(ready.map((q) => q.shop_id)).size,
    platform_count: new Set(current.map((q) => q.platform)).size,
    recorded_platform_count: new Set(matches.map((q) => q.platform)).size,
    min_price: minimum,
    min_price_shops: best,
    last_observed_price: lastObserved?.price ?? null,
    last_observed_at: lastObserved?.checked_at ?? null,
  };
}

import type { Shop } from "../../shared/api-types";
import { platformName } from "./catalog-format";

export function filterShops(
  shops: Shop[],
  filters: {
    q: string;
    platform: string;
    category: string;
    ready: boolean;
    saved: boolean;
    favorites: string[];
    sort: string;
  },
) {
  const q = filters.q.trim().toLowerCase();
  return shops
    .filter(
      (s) =>
        s.listed &&
        (filters.platform === "all" || s.platform === filters.platform) &&
        (filters.category === "all" ||
          s.categories?.includes(filters.category)) &&
        (!filters.ready || (s.active_quotes || 0) > 0) &&
        (!filters.saved || filters.favorites.includes(s.id)) &&
        (s.name + " " + platformName(s.platform)).toLowerCase().includes(q),
    )
    .sort((a, b) => {
      const timestamp = (s: Shop) => Date.parse(s.checked_at || "") || 0;
      return (
        (filters.sort === "updated"
          ? timestamp(b) - timestamp(a)
          : filters.sort === "name"
            ? 0
            : (b.active_quotes || 0) - (a.active_quotes || 0)) ||
        a.name.localeCompare(b.name, "zh-CN") ||
        a.id.localeCompare(b.id)
      );
    });
}

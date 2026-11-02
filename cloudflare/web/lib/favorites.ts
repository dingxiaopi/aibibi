import { useSyncExternalStore } from "react";

export type FavoriteKind = "products" | "shops";
export interface Favorites {
  products: string[];
  shops: string[];
  persistent: boolean;
}
const key = "ai-bibi-favorites-v1";
const event = "ai-bibi:favorites";
const empty: Favorites = { products: [], shops: [], persistent: true };
let cached = empty;
let lastRaw: string | null | undefined;

export function parseFavorites(raw: string | null): Favorites {
  try {
    const data = JSON.parse(raw || "{}");
    const ids = (value: unknown) =>
      Array.isArray(value)
        ? [
            ...new Set(
              value.filter(
                (id): id is string =>
                  typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id),
              ),
            ),
          ].slice(0, 500)
        : [];
    return {
      products: ids(data?.products),
      shops: ids(data?.shops),
      persistent: true,
    };
  } catch {
    return empty;
  }
}

function snapshot() {
  if (!cached.persistent) return cached;
  try {
    const raw = localStorage.getItem(key);
    if (raw !== lastRaw) {
      lastRaw = raw;
      cached = parseFavorites(raw);
    }
  } catch {
    cached = { ...cached, persistent: false };
  }
  return cached;
}
function subscribe(listener: () => void) {
  const storage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) listener();
  };
  window.addEventListener(event, listener);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(event, listener);
    window.removeEventListener("storage", storage);
  };
}
function toggle(kind: FavoriteKind, id: string) {
  const previous = snapshot();
  const ids = previous[kind].includes(id)
    ? previous[kind].filter((x) => x !== id)
    : [...previous[kind], id].slice(-500);
  cached = { ...previous, [kind]: ids };
  try {
    const raw = JSON.stringify({
      products: cached.products,
      shops: cached.shops,
    });
    localStorage.setItem(key, raw);
    lastRaw = raw;
    cached = { ...cached, persistent: true };
  } catch {
    cached = { ...cached, persistent: false };
  }
  window.dispatchEvent(new Event(event));
}
export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, snapshot, () => empty);
  return { favorites, toggle };
}

import * as he from "he";
export type Obj = Record<string, unknown>;
export const obj = (x: unknown): Obj =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : {};
export const text = (x: unknown) => String(x ?? "");
export const plain = (x: unknown) =>
  he
    .decode(
      text(x)
        .replace(/<(?:script|style)\b[^>]*>.*?<\/(?:script|style)>/gis, "")
        .replace(/<[^>]*>/g, " "),
    )
    .replace(/\s+/g, " ")
    .trim();
export const now = () =>
  new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
export async function hash(x: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(x)),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export const fingerprint = (x: Obj) =>
  hash(plain(x.name) + "\n" + plain(x.description));
export function fresh(q: Obj, hours: number, time = Date.now()) {
  const age = time - Date.parse(text(q.checked_at));
  const inventoryAge = q.inventory_checked_at
    ? time - Date.parse(text(q.inventory_checked_at))
    : age;
  return (
    q.collection_status === "ok" &&
    q.listing_status === "listed" &&
    age >= -300000 &&
    age < hours * 3600000 &&
    inventoryAge >= -300000 &&
    inventoryAge < hours * 3600000
  );
}
export function available(q: Obj, hours: number) {
  return (
    fresh(q, hours) &&
    q.stock_status === "in_stock" &&
    q.availability === "ready"
  );
}
export type Shop = {
  id: string;
  platform: string;
  token: string;
  name: string;
  url: string;
  data: string;
  enabled: number;
  cloud_enabled?: number;
  status: string;
  checked_at: string | null;
  error: string | null;
};

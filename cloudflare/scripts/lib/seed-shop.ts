import { MAX_SHOPS } from "../../shared/site.ts";
const sql = (value: unknown) =>
  value == null ? "NULL" : "'" + String(value).replaceAll("'", "''") + "'";
/** The seed path also enforces capacity atomically; a new overflow row fails its NOT NULL data constraint. */
export function seedShopStatement(
  shop: Record<string, unknown>,
  token: unknown,
) {
  return `INSERT INTO shops(id,platform,token,name,url,data,status,checked_at) SELECT ${[shop.id, shop.platform, token, shop.name, shop.url].map(sql)},CASE WHEN (SELECT COUNT(*) FROM shops)<${MAX_SHOPS} THEN ${sql(JSON.stringify(shop))} ELSE NULL END,${sql(shop.collection_status)},${sql(shop.checked_at)} WHERE NOT EXISTS(SELECT 1 FROM shops WHERE id=${sql(shop.id)});`;
}

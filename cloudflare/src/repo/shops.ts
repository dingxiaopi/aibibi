import { MAX_SHOPS } from "../../shared/site";
/** Prepared statements for shops; callers retain binding and transaction order. */
export function importExternalSelectShops(env: Env) {
  return env.DB.prepare("SELECT * FROM shops WHERE id=?");
}

export function registerShopSelectShops(env: Env) {
  return env.DB.prepare("SELECT id FROM shops WHERE id=?");
}

export function registerShopInsertShops(env: Env) {
  return env.DB.prepare(
    `INSERT INTO shops(id,platform,token,name,url,data,status,checked_at,cloud_enabled) SELECT ?,?,?,?,?,?,'ok',?,0 WHERE (SELECT COUNT(*) FROM shops)<${MAX_SHOPS} ON CONFLICT(id) DO NOTHING`,
  );
}

export function updateShopUpdateShops(env: Env) {
  return env.DB.prepare(
    "UPDATE shops SET status=CASE WHEN json_extract(data,'$.disabled_at') IS NOT NULL THEN 'disabled' ELSE ? END,checked_at=?,data=json_set(data,'$.source_item_count',?,'$.acquisition_method','external_local','$.attempted_at',?),error=? WHERE id=? AND julianday(COALESCE(json_extract(data,'$.attempted_at'),checked_at,'1970-01-01'))<=julianday(?)",
  );
}

export function updateShopUpdateShops2(env: Env) {
  return env.DB.prepare(
    "UPDATE shops SET enabled=0,cloud_enabled=0,data=json_set(data,'$.disabled_at',?,'$.disabled_reason',?,'$.closure_evidence',json(?)) WHERE id=? AND status='disabled'",
  );
}

export function updateShopUpdateShops3(env: Env) {
  return env.DB.prepare(
    "UPDATE shops SET data=json_set(data,'$.collection_paused',json(?),'$.pause_reason',?) WHERE id=? AND julianday(json_extract(data,'$.attempted_at'))<=julianday(?)",
  );
}

export function collectionStatusSelectShops(env: Env) {
  return env.DB.prepare(
    "SELECT id,name,platform,enabled,status,checked_at,error,data FROM shops ORDER BY status DESC,name",
  );
}

export function adminRoutesUpdateShops(env: Env) {
  return env.DB.prepare("UPDATE shops SET enabled=? WHERE id=?");
}

export function adminRoutesSelectShops(env: Env) {
  return env.DB.prepare("SELECT * FROM shops WHERE id=?");
}

export function collectorRoutesSelectShops(env: Env) {
  return env.DB.prepare("SELECT id,data FROM shops WHERE enabled=0");
}

export function publicShopsSelectShops(env: Env) {
  return env.DB.prepare(
    "SELECT id,platform,name,url,data,enabled,cloud_enabled,status,checked_at,error FROM shops ORDER BY platform,name",
  );
}

export function productsSelectShops(env: Env) {
  return env.DB.prepare("SELECT COUNT(*) AS n FROM shops");
}
export const catalogShops = (env: Env) =>
  env.DB.prepare(
    "SELECT id,platform,name,url,data,enabled,status,checked_at,error FROM shops",
  );

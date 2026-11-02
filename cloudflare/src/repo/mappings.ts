/** Prepared statements for mappings; callers retain binding and transaction order. */
export function importMappingSelectMappings(env: Env) {
  return env.DB.prepare(
    "SELECT fingerprint,data FROM mappings WHERE shop_id=? AND source_id=?",
  );
}

export function importMappingInsertMappings(env: Env) {
  return env.DB.prepare(
    "INSERT INTO mappings SELECT ?,?,?,?,? WHERE (SELECT fingerprint FROM mappings WHERE shop_id=? AND source_id=?) IS ? AND NOT EXISTS(SELECT 1 FROM goods WHERE id=? AND review_status='rejected' AND julianday(data_at)>=julianday(?)) ON CONFLICT(shop_id,source_id) DO UPDATE SET sku=excluded.sku,fingerprint=excluded.fingerprint,data=excluded.data",
  );
}

export function importQuoteSelectMappings(env: Env) {
  return env.DB.prepare(
    "SELECT data,fingerprint,sku FROM mappings WHERE shop_id=? AND source_id=?",
  );
}

export function adminRoutesDeleteMappings(env: Env) {
  return env.DB.prepare("DELETE FROM mappings WHERE shop_id=? AND source_id=?");
}

export function collectorRoutesSelectMappings(env: Env) {
  return env.DB.prepare(
    "SELECT m.shop_id,m.source_id,m.fingerprint,m.data AS mapping_data,g.data_at AS reviewed_at FROM mappings m LEFT JOIN goods g ON g.id=m.shop_id||':'||m.source_id",
  );
}

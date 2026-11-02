/** Prepared statements for goods; callers retain binding and transaction order. */
export function importMappingSelectGoods(env: Env) {
  return env.DB.prepare("SELECT review_status,data_at FROM goods WHERE id=?");
}

export function importMappingInsertGoods(env: Env) {
  return env.DB.prepare(
    "INSERT INTO goods(id,shop_id,source_id,title,fingerprint,raw,data_at,reason,review_status) SELECT ?,?,?,?,?,?,?,'本地详情审核通过','approved' WHERE changes()>0 ON CONFLICT(id) DO UPDATE SET title=excluded.title,fingerprint=excluded.fingerprint,raw=excluded.raw,data_at=excluded.data_at,reason=excluded.reason,review_status='approved'",
  );
}

export function importQuoteSelectGoods(env: Env) {
  return env.DB.prepare(
    // Any review state: an item sent back to review keeps its source link.
    "SELECT raw FROM goods WHERE id=?",
  );
}

export function importReviewsInsertGoods(env: Env) {
  return env.DB.prepare(
    "INSERT INTO goods(id,shop_id,source_id,title,data_at,reason) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,reason=excluded.reason,data_at=excluded.data_at,review_status='pending' WHERE goods.review_status!='rejected' AND julianday(goods.data_at)<=julianday(excluded.data_at)",
  );
}

export function coverageSelectGoods(env: Env) {
  return env.DB.prepare(
    "SELECT COUNT(*) AS n FROM goods WHERE review_status='pending'",
  );
}

export function coverageCandidatesSelectGoods(env: Env, where: string) {
  return env.DB.prepare(
    `SELECT COUNT(*) AS n FROM goods g JOIN shops s ON s.id=g.shop_id WHERE ${where}`,
  );
}

export function adminRoutesSelectGoods(env: Env) {
  return env.DB.prepare(
    "SELECT COUNT(*) AS n FROM goods WHERE review_status='pending'",
  );
}

export function adminRoutesSelectGoods2(env: Env, id: string) {
  return env.DB.prepare(
    "SELECT g.*,s.name AS shop_name,s.platform,s.cloud_enabled FROM goods g JOIN shops s ON s.id=g.shop_id WHERE g.review_status='pending'" +
      (id ? " AND g.id=?" : "") +
      " ORDER BY g.data_at DESC,g.id LIMIT 25 OFFSET ?",
  );
}

export function adminRoutesSelectGoods3(env: Env) {
  return env.DB.prepare("SELECT * FROM goods WHERE id=?");
}

export function adminRoutesUpdateGoods(env: Env) {
  return env.DB.prepare(
    "UPDATE goods SET review_status='rejected',reason='人工排除',data_at=? WHERE id=?",
  );
}

export function collectorRoutesSelectGoods(env: Env) {
  return env.DB.prepare(
    "SELECT shop_id,source_id,data_at FROM goods WHERE review_status='rejected'",
  );
}

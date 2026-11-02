export const reportQuote = (env: Env) =>
  env.DB.prepare(
    "SELECT q.data,s.name AS shop_name FROM quotes q JOIN shops s ON s.id=q.shop_id WHERE q.id=?",
  );
export const existingReport = (env: Env) =>
  env.DB.prepare("SELECT id FROM quote_reports WHERE dedup_key=?");
export const reportCapacity = (env: Env) =>
  env.DB.prepare(
    "SELECT COUNT(*) AS n FROM quote_reports WHERE status='pending'",
  );
export const cleanReportLimits = (env: Env) =>
  env.DB.prepare("DELETE FROM rate_limits WHERE expires_at<=?");
export const reserveReport = (env: Env) =>
  env.DB.prepare(
    "INSERT INTO rate_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END WHERE expires_at<=? OR attempts<5 RETURNING key",
  );
export const insertReport = (env: Env) =>
  env.DB.prepare(
    "INSERT INTO quote_reports(id,quote_id,reason,note,snapshot,dedup_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(dedup_key) DO NOTHING",
  );
export const listReports = (env: Env) =>
  env.DB.prepare(
    "SELECT id,quote_id,reason,note,snapshot,status,created_at,updated_at FROM quote_reports WHERE (?='all' OR status=?) ORDER BY created_at DESC,id LIMIT 100 OFFSET ?",
  );
export const updateReport = (env: Env) =>
  env.DB.prepare("UPDATE quote_reports SET status=?,updated_at=? WHERE id=?");

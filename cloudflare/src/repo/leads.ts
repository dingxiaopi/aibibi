/** Prepared statements for leads; callers retain binding and transaction order. */
export function adminRoutesSelectLeads(env: Env) {
  return env.DB.prepare(
    "SELECT * FROM leads WHERE status='pending' ORDER BY created_at DESC LIMIT 50",
  );
}

export function publicRoutesSelectLeads(env: Env) {
  return env.DB.prepare("SELECT COUNT(*) AS n FROM leads");
}

export function publicRoutesInsertLeads(env: Env) {
  return env.DB.prepare(
    "INSERT OR IGNORE INTO leads(id,name,url,note,created_at) VALUES(?,?,?,?,?)",
  );
}

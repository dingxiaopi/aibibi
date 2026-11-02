/** Prepared statements for observations; callers retain binding and transaction order. */
export function importQuoteInsertObservations(env: Env) {
  return env.DB.prepare("INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?)");
}

export function publicRoutesSelectObservations(env: Env) {
  return env.DB.prepare(
    "SELECT o.quote_id,o.checked_at,o.price,s.name FROM observations o JOIN quotes q ON q.id=o.quote_id JOIN shops s ON s.id=q.shop_id WHERE o.sku=? ORDER BY o.checked_at DESC LIMIT 100",
  );
}

/** Prepared statements for runs; callers retain binding and transaction order. */
export function adminRoutesSelectRuns(env: Env) {
  return env.DB.prepare(
    "SELECT r.*,s.name FROM runs r JOIN shops s ON s.id=r.shop_id ORDER BY created_at DESC LIMIT 50",
  );
}

/** Prepared statements for jobs; callers retain binding and transaction order. */
export function adminRoutesSelectJobs(env: Env) {
  return env.DB.prepare(
    "SELECT j.id,j.error,s.name FROM jobs j JOIN runs r ON r.id=j.run_id JOIN shops s ON s.id=r.shop_id WHERE j.status='failed' ORDER BY r.created_at DESC LIMIT 20",
  );
}

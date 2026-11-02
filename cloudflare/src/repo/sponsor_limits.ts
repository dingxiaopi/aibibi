/** Prepared statements for sponsor_limits; callers retain binding and transaction order. */
export function throttleInsertSponsorLimits(env: Env) {
  return env.DB.prepare(
    "INSERT INTO sponsor_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count",
  );
}

export function publicSponsorsDeleteSponsorLimits(env: Env) {
  return env.DB.prepare(
    "DELETE FROM sponsor_limits WHERE key IN (SELECT key FROM sponsor_limits WHERE expires_at<? LIMIT 200)",
  );
}

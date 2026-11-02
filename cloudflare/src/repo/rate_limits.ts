/** Public lead windows are independent of administrator authentication. */

export function publicRoutesSelectRateLimits(env: Env) {
  return env.DB.prepare(
    "SELECT attempts FROM rate_limits WHERE key=? AND expires_at>?",
  );
}

export function publicRoutesInsertRateLimits(env: Env) {
  return env.DB.prepare(
    "INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END",
  );
}

export function publicRoutesDeleteRateLimits(env: Env) {
  return env.DB.prepare("DELETE FROM rate_limits WHERE expires_at<?");
}

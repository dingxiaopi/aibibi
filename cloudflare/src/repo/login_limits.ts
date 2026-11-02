/** Prepared statements for login_limits; callers retain binding and transaction order. */
export function loginDeleteLoginLimits(env: Env) {
  return env.DB.prepare("DELETE FROM login_limits WHERE expires_at<?");
}

export function loginSelectLoginLimits(env: Env) {
  return env.DB.prepare("SELECT attempts FROM login_limits WHERE key=?");
}

export function loginInsertLoginLimits(env: Env) {
  return env.DB.prepare(
    "INSERT INTO login_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1",
  );
}

export function loginDeleteLoginLimits2(env: Env) {
  return env.DB.prepare("DELETE FROM login_limits WHERE key=?");
}

/** Prepared statements for sessions; callers retain binding and transaction order. */
export function loggedInSelectSessions(env: Env) {
  return env.DB.prepare(
    "SELECT hash FROM sessions WHERE hash=? AND expires_at>?",
  );
}

export function loginDeleteSessions(env: Env) {
  return env.DB.prepare("DELETE FROM sessions WHERE expires_at<?");
}

export function loginInsertSessions(env: Env) {
  return env.DB.prepare("INSERT INTO sessions VALUES(?,?)");
}

export function adminRoutesDeleteSessions(env: Env) {
  return env.DB.prepare("DELETE FROM sessions WHERE hash=?");
}

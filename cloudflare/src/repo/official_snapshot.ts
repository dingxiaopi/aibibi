/** Prepared statements for the pushed official-price snapshot; callers retain binding order. */
export const officialVersion = (env: Env) =>
  env.DB.prepare(
    "SELECT collected_at,sha256 FROM official_snapshot WHERE id=1",
  );
export const officialBody = (env: Env) =>
  env.DB.prepare("SELECT sha256,body FROM official_snapshot WHERE id=1");
export const saveOfficial = (env: Env) =>
  env.DB.prepare(
    "INSERT INTO official_snapshot(id,collected_at,sha256,body,received_at) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET collected_at=excluded.collected_at,sha256=excluded.sha256,body=excluded.body,received_at=excluded.received_at",
  );

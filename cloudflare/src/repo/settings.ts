export type Settings = {
  auto_enabled: number;
  interval_days: number;
  freshness_hours: number;
  last_auto_at: string | null;
};
export const settings = (env: Env) =>
  env.DB.prepare("SELECT * FROM settings WHERE id=1").first<Settings>();

/** Prepared statements for settings; callers retain binding and transaction order. */
export function adminRoutesUpdateSettings(env: Env) {
  return env.DB.prepare(
    "UPDATE settings SET auto_enabled=?,interval_days=?,freshness_hours=? WHERE id=1",
  );
}

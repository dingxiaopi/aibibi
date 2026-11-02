/** Prepared statements for sponsor_revisions; callers retain binding and transaction order. */
export function adminSponsorsSelectSponsorRevisions(env: Env) {
  return env.DB.prepare(
    "SELECT revision,data,at FROM sponsor_revisions WHERE campaign_id=? ORDER BY revision DESC LIMIT 30",
  );
}

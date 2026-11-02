/** Prepared statements for sponsor_assets; callers retain binding and transaction order. */
export function adminSponsorsSelectSponsorAssets(env: Env) {
  return env.DB.prepare("SELECT COUNT(*) AS n FROM sponsor_assets");
}

export function adminSponsorsInsertSponsorAssets(env: Env) {
  return env.DB.prepare("INSERT INTO sponsor_assets VALUES(?,?,?,?,?)");
}

export function validateCampaignSelectSponsorAssets(env: Env) {
  return env.DB.prepare("SELECT id FROM sponsor_assets WHERE id=?");
}

export function publicSponsorsSelectSponsorAssets(env: Env) {
  return env.DB.prepare("SELECT mime,bytes FROM sponsor_assets WHERE id=?");
}

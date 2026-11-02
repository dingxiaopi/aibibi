/** Prepared statements for sponsor_campaigns; callers retain binding and transaction order. */
export function adminSponsorsSelectSponsorCampaigns(env: Env) {
  return env.DB.prepare(
    "SELECT * FROM sponsor_campaigns ORDER BY updated_at DESC LIMIT 200",
  );
}

export function adminSponsorsUpdateSponsorCampaigns(env: Env) {
  return env.DB.prepare(
    "UPDATE sponsor_campaigns SET slot=?,category=?,status=?,starts_at=?,ends_at=?,data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND (NOT EXISTS(SELECT 1 FROM sponsor_daily WHERE campaign_id=sponsor_campaigns.id) OR (slot=? AND category=? AND json_extract(data,'$.brand')=?))",
  );
}

export function adminSponsorsSelectSponsorCampaigns2(env: Env) {
  return env.DB.prepare("SELECT COUNT(*) AS n FROM sponsor_campaigns");
}

export function adminSponsorsInsertSponsorCampaigns(env: Env) {
  return env.DB.prepare(
    "INSERT INTO sponsor_campaigns(id,slot,category,status,starts_at,ends_at,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
  );
}

export function publicSponsorsSelectSponsorCampaigns(
  env: Env,
  page: string | null,
) {
  return env.DB.prepare(
    "SELECT * FROM sponsor_campaigns WHERE status='active' AND starts_at<=? AND ends_at>? AND (category='all' OR category=?) AND " +
      (page === "home" ? "slot IN ('hero','home-inline')" : "slot='detail'") +
      " ORDER BY slot LIMIT 2",
  );
}

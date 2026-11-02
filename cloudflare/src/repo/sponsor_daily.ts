/** Prepared statements for sponsor_daily; callers retain binding and transaction order. */
export function reportSelectSponsorDaily(env: Env) {
  return env.DB.prepare(
    "SELECT d.campaign_id,d.day,d.impressions,d.clicks,c.slot,json_extract(c.data,'$.brand') AS brand,json_extract(c.data,'$.title') AS title FROM sponsor_daily d JOIN sponsor_campaigns c ON c.id=d.campaign_id WHERE d.day>=? AND d.day<=? ORDER BY d.day DESC,c.id",
  );
}

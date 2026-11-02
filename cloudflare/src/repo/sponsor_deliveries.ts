/** Prepared statements for sponsor_deliveries; callers retain binding and transaction order. */
export function publicSponsorsInsertSponsorDeliveries(env: Env) {
  return env.DB.prepare(
    "INSERT INTO sponsor_deliveries(id,campaign_id,revision,viewer_hash,created_at,expires_at) VALUES(?,?,?,?,?,?)",
  );
}

export function publicSponsorsDeleteSponsorDeliveries(env: Env) {
  return env.DB.prepare(
    "DELETE FROM sponsor_deliveries WHERE id IN (SELECT id FROM sponsor_deliveries WHERE expires_at<? LIMIT 200)",
  );
}

export function publicSponsorsSelectSponsorDeliveries(env: Env) {
  return env.DB.prepare(
    "SELECT c.*,d.viewer_hash,d.expires_at FROM sponsor_deliveries d JOIN sponsor_campaigns c ON c.id=d.campaign_id AND c.revision=d.revision WHERE d.id=? AND c.status='active' AND c.starts_at<=? AND c.ends_at>?",
  );
}

export function publicSponsorsUpdateSponsorDeliveries(
  env: Env,
  click: RegExpMatchArray | null,
) {
  return env.DB.prepare(
    "UPDATE sponsor_deliveries SET impression_at=COALESCE(impression_at,?),click_at=" +
      (click ? "COALESCE(click_at,?)" : "click_at") +
      " WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM sponsor_campaigns WHERE id=sponsor_deliveries.campaign_id AND revision=sponsor_deliveries.revision AND status='active' AND starts_at<=? AND ends_at>?)",
  );
}

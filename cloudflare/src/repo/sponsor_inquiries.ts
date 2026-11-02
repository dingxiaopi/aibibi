/** Prepared statements for sponsor_inquiries; callers retain binding and transaction order. */
export function adminSponsorsSelectSponsorInquiries(env: Env) {
  return env.DB.prepare(
    "SELECT * FROM sponsor_inquiries ORDER BY created_at DESC LIMIT 100",
  );
}

export function adminSponsorsUpdateSponsorInquiries(env: Env) {
  return env.DB.prepare("UPDATE sponsor_inquiries SET status=? WHERE id=?");
}

export function publicSponsorsSelectSponsorInquiries(env: Env) {
  return env.DB.prepare("SELECT COUNT(*) AS n FROM sponsor_inquiries");
}

export function publicSponsorsInsertSponsorInquiries(env: Env) {
  return env.DB.prepare(
    "INSERT INTO sponsor_inquiries(id,brand,contact,message,slot,created_at) VALUES(?,?,?,?,?,?)",
  );
}

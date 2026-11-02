/** Prepared statements for local_transfers; callers retain binding and transaction order. */
export function collectionStatusSelectLocalTransfers(env: Env) {
  return env.DB.prepare(
    "SELECT id,source_at,counts,total_batches,done_batches,status,created_at,updated_at,finished_at,error,failed_index,lease_until FROM local_transfers ORDER BY created_at DESC LIMIT 20",
  );
}

export function transferStateSelectLocalTransfers(env: Env) {
  return env.DB.prepare(
    "SELECT id,source_at,counts,total_batches,done_batches,status,created_at,updated_at,finished_at,error,failed_index,lease_until FROM local_transfers WHERE id=?",
  );
}

export function beginTransferInsertLocalTransfers(env: Env) {
  return env.DB.prepare(
    "INSERT OR IGNORE INTO local_transfers(id,manifest,source_at,counts,total_batches,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
  );
}

export function ingestTrackedSelectLocalTransfers(env: Env) {
  return env.DB.prepare("SELECT * FROM local_transfers WHERE id=?");
}

export function ingestTrackedUpdateLocalTransfers(env: Env) {
  return env.DB.prepare(
    "UPDATE local_transfers SET lease_token=?,lease_until=?,status='running',updated_at=? WHERE id=? AND done_batches=? AND (lease_until IS NULL OR julianday(lease_until)<=julianday(?))",
  );
}

export function ingestTrackedUpdateLocalTransfers2(env: Env) {
  return env.DB.prepare(
    "UPDATE local_transfers SET done_batches=done_batches+1,status=CASE WHEN done_batches+1=total_batches THEN 'complete' ELSE 'running' END,finished_at=CASE WHEN done_batches+1=total_batches THEN ? ELSE NULL END,updated_at=?,error=NULL,failed_index=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
  );
}

export function recordFailureUpdateLocalTransfers(env: Env) {
  return env.DB.prepare(
    "UPDATE local_transfers SET status='failed',updated_at=?,error=?,failed_index=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
  );
}

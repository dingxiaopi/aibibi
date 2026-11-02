/** Prepared statements for local_transfer_batches; callers retain binding and transaction order. */
export function ingestTrackedInsertLocalTransferBatches(env: Env) {
  return env.DB.prepare(
    "INSERT INTO local_transfer_batches(transfer_id,batch_index,status,updated_at) VALUES(?,?,'running',?) ON CONFLICT(transfer_id,batch_index) DO UPDATE SET status='running',attempts=attempts+1,updated_at=excluded.updated_at,error=NULL",
  );
}

export function ingestTrackedUpdateLocalTransferBatches(env: Env) {
  return env.DB.prepare(
    "UPDATE local_transfer_batches SET status='ok',updated_at=?,error=NULL WHERE transfer_id=? AND batch_index=? AND EXISTS(SELECT 1 FROM local_transfers WHERE id=? AND lease_token=?)",
  );
}

export function recordFailureUpdateLocalTransferBatches(env: Env) {
  return env.DB.prepare(
    "UPDATE local_transfer_batches SET status='failed',updated_at=?,error=? WHERE transfer_id=? AND batch_index=? AND EXISTS(SELECT 1 FROM local_transfers WHERE id=? AND lease_token=?)",
  );
}

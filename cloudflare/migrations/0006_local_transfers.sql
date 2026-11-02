-- Local collectors report a content-addressed plan; successful receipts survive retries.
CREATE TABLE local_transfers (
  id TEXT PRIMARY KEY,
  manifest TEXT NOT NULL,
  source_at TEXT,
  counts TEXT NOT NULL,
  total_batches INTEGER NOT NULL CHECK(total_batches BETWEEN 1 AND 2000),
  done_batches INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  error TEXT,
  failed_index INTEGER,
  lease_token TEXT,
  lease_until TEXT
);
CREATE INDEX local_transfers_recent ON local_transfers(created_at DESC);
CREATE TABLE local_transfer_batches (
  transfer_id TEXT NOT NULL REFERENCES local_transfers(id),
  batch_index INTEGER NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  error TEXT,
  PRIMARY KEY(transfer_id,batch_index)
);

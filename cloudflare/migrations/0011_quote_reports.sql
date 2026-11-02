CREATE TABLE quote_reports(
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('price','stock','spec','link','other')),
  note TEXT NOT NULL DEFAULT '',
  snapshot TEXT NOT NULL,
  dedup_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved','dismissed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX quote_reports_status_time ON quote_reports(status,created_at DESC);

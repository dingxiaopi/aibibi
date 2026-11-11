-- Latest accepted official-price snapshot, pushed by the collector. Without a row the Worker uses the bundled snapshot.
CREATE TABLE official_snapshot(id INTEGER PRIMARY KEY CHECK(id=1),collected_at TEXT NOT NULL,sha256 TEXT NOT NULL,body TEXT NOT NULL,received_at TEXT NOT NULL);

CREATE TABLE rate_limits(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at TEXT NOT NULL);
CREATE INDEX rate_limits_expiry ON rate_limits(expires_at);
/* Legacy namespaces are hashed. Preserve all active windows; unused login keys expire naturally. */ INSERT INTO rate_limits(key,attempts,expires_at) SELECT key,attempts,expires_at FROM login_limits WHERE julianday(expires_at)>julianday('now');

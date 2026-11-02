ALTER TABLE shops ADD COLUMN cloud_enabled INTEGER NOT NULL DEFAULT 1;
UPDATE shops SET cloud_enabled=0 WHERE platform='wzyp';

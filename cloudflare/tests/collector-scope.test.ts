import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("sample collector sync ignores unrelated moderation but still validates its own stores", () => {
  const directory = mkdtempSync(join(tmpdir(), "aibibi-sync-scope-"));
  try {
    const seeds = { shops: [{ id: "S1" }], products: [], mappings: {}, exclusions: {} };
    const script = new URL("../scripts/sync-local.mjs", import.meta.url).href;
    const run = (rejected: unknown[]) => {
      writeFileSync(join(directory, "seeds.json"), JSON.stringify(seeds));
      return spawnSync(process.execPath, ["--input-type=module", "-e", `
        globalThis.fetch = async (url) => Response.json(String(url).includes('/api/collector/state')
          ? {rejected: ${JSON.stringify(rejected)}, disabled_shops: [], mapping_states: []}
          : {products: []});
        await import(${JSON.stringify(script)});
      `], { env: { ...process.env, BIJIA_DATA_DIR: directory,
        BIJIA_URL: "https://scope.test", BIJIA_INGEST_TOKEN: "test-collector-credential-not-real" }, encoding: "utf8" });
    };
    const other = run([{ shop_id: "S2", source_id: "invalid-unrelated", data_at: "invalid" }]);
    assert.equal(other.status, 0, other.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(directory, "seeds.json"), "utf8")).exclusions, {});
    const own = run([{ shop_id: "S1", source_id: "invalid-own", data_at: "invalid" }]);
    assert.notEqual(own.status, 0);
    assert.match(own.stderr, /排除记录身份或时间无效/);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

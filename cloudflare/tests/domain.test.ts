import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { plain, fingerprint, fresh } from "../src/domain";
test("HTML normalization and fingerprint match the established Python collector", async () => {
  const raw = {
    name: " Plus &amp; 月卡 ",
    description: "<style>x</style><p>30&nbsp;天</p><script>bad()</script>",
  };
  const py = execFileSync(
    "python3",
    [
      "-c",
      "import sys,json;sys.path.insert(0,'..');from collector.collect import fingerprint;print(fingerprint(json.loads(sys.argv[1])))",
      JSON.stringify(raw),
    ],
    { encoding: "utf8" },
  ).trim();
  assert.equal(await fingerprint(raw), py);
  assert.equal(plain(raw.description), "30 天");
});
test("shared Chinese, markup, entities and whitespace samples produce identical Python and TS fingerprints", async () => {
  const samples = JSON.parse(
    readFileSync("tests/fixtures/fingerprints.json", "utf8"),
  );
  const expected = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        "import sys,json;sys.path.insert(0,'..');from collector.collect import fingerprint;print(json.dumps([fingerprint(x) for x in json.loads(sys.argv[1])]))",
        JSON.stringify(samples),
      ],
      { encoding: "utf8" },
    ),
  );
  assert.deepEqual(
    await Promise.all(
      samples.map((item: Record<string, unknown>) => fingerprint(item)),
    ),
    expected,
  );
});
test("configurable freshness checks both price and original list inventory time", () => {
  const t = Date.parse("2026-10-14T12:00:00Z"),
    q = {
      collection_status: "ok",
      listing_status: "listed",
      checked_at: "2026-10-13T00:00:00Z",
    };
  assert.equal(fresh(q, 24, t), false);
  assert.equal(fresh(q, 48, t), true);
  assert.equal(
    fresh({ ...q, inventory_checked_at: "2026-10-10T00:00:00Z" }, 48, t),
    false,
  );
});

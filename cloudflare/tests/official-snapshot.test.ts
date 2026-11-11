import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { workerScript } from "./helpers/worker";
import bundled from "../shared/official-prices.json";
import type { OfficialData } from "../shared/official-prices";

const TOKEN = "t".repeat(32);
const asset =
  '<!doctype html><html><head><title>default</title></head><body><div id="root"></div></body></html>';
const worker = async (migrations: string[]) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: await workerScript(),
      compatibilityDate: "2026-10-13",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: crypto.randomUUID() },
      bindings: { PUBLIC_SITE: "true", COLLECTOR_INGEST_TOKEN: TOKEN },
      serviceBindings: {
        ASSETS: async () =>
          new Response(asset, { headers: { "Content-Type": "text/html" } }),
      },
    }),
  );
  const db = await mf.getD1Database("DB");
  try {
    for (const file of migrations)
      await db.exec(
        readFileSync(`migrations/${file}`, "utf8")
          .replace(/^--.*$/gm, "")
          .replace(/\n/g, " "),
      );
  } catch (error) {
    await mf.dispose();
    throw error;
  }
  return mf;
};
const snapshot = (collected_at: string) =>
  ({ ...structuredClone(bundled), collected_at }) as OfficialData;
let mf: Miniflare;
const push = (data: unknown, token = TOKEN) =>
  mf.dispatchFetch("https://example.test/api/collector/official", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
const current = async () =>
  (await (
    await mf.dispatchFetch("https://example.test/api/official")
  ).json()) as OfficialData;

before(async () => {
  mf = await worker(
    readdirSync("migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort(),
  );
});

after(() => mf?.dispose());

test("the bundled snapshot is served until a push, then the pushed one on API, SSR and sitemap", async () => {
  assert.equal((await current()).collected_at, bundled.collected_at);
  const next = snapshot("2099-01-02T03:04:05+00:00");
  const response = await push(next);
  assert.equal(response.status, 200);
  assert.deepEqual(
    { ...((await response.json()) as object), sha256: undefined },
    {
      ok: true,
      changed: true,
      collected_at: next.collected_at,
      sha256: undefined,
    },
  );
  assert.equal((await current()).collected_at, next.collected_at);
  const html = await (
    await mf.dispatchFetch("https://example.test/official/chatgpt")
  ).text();
  const initial = JSON.parse(
    html.match(/<script type="application\/json" id="initial-data">(.*?)<\/script>/s)![1],
  );
  assert.equal(initial["/api/official"].collected_at, next.collected_at);
  const xml = await (
    await mf.dispatchFetch("https://example.test/sitemap.xml")
  ).text();
  assert.match(xml, /official<\/loc><lastmod>2099-01-02T03:04:05\.000Z/);
  const again = await push(next);
  assert.equal(((await again.json()) as { changed: boolean }).changed, false);
});

test("pushes need the collector token, a valid snapshot and must not be older than the stored one", async () => {
  // Rejected before the body is read, so keep it small for the local HTTP client.
  assert.equal((await push({}, "x".repeat(32))).status, 401);
  assert.equal((await push({ ...snapshot("2099-02-01T00:00:00+00:00"), prices: [] })).status, 400);
  const older = await push(snapshot("2098-01-01T00:00:00+00:00"));
  assert.equal(older.status, 409);
  assert.equal((await current()).collected_at, "2099-01-02T03:04:05+00:00");
  const read = await mf.dispatchFetch("https://example.test/api/collector/official", {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(read.status, 405);
});

test("before the migration runs the bundled snapshot still renders", async () => {
  const old = await worker(["0001_initial.sql"]);
  const response = await old.dispatchFetch("https://example.test/api/official");
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as OfficialData).collected_at, bundled.collected_at);
  await old.dispose();
});

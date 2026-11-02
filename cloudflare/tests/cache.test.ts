import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { workerScript } from "./helpers/worker";
import { cacheKey } from "../src/cache";
let mf: Miniflare;
const call = (
  path: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> },
) => mf.dispatchFetch(`https://example.test${path}`, init);
before(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: await workerScript(),
      compatibilityDate: "2026-10-13",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "cache" },
      bindings: { PUBLIC_SITE: "true", EDGE_CACHE_SECONDS: "300" },
      serviceBindings: {
        ASSETS: async () =>
          new Response(
            "<!doctype html><html><head></head><body></body></html>",
            {
              headers: { "Content-Type": "text/html" },
            },
          ),
      },
    }),
  );
  const db = await mf.getD1Database("DB");
  for (const file of [
    "0001_initial.sql",
    "0002_idempotent_shop_import.sql",
    "0003_external_collection.sql",
  ])
    await db.exec(readFileSync(`migrations/${file}`, "utf8"));
});
after(async () => mf?.dispose());

test("public reads are served from cache without touching the client cache policy", async () => {
  const first = await call("/api/products");
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("X-Cache"), "miss");
  const second = await call("/api/products");
  assert.notEqual(second.headers.get("X-Cache"), "miss");
  assert.equal(second.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await second.json(), await first.json());
  const page = await call("/");
  await call("/");
  assert.notEqual((await call("/")).headers.get("X-Cache"), "miss");
  assert.equal(page.headers.get("Cache-Control"), "public, max-age=300");
});

test("private and write requests bypass the cache", async () => {
  for (const path of ["/api/admin/dashboard", "/api/collector/state"])
    assert.equal((await call(path)).headers.get("X-Cache"), null);
  const write = await call("/api/leads", { method: "POST", body: "{}" });
  assert.equal(write.headers.get("X-Cache"), null);
});

test("tracking links share a cache entry while functional query parameters stay separate", async () => {
  const first = await call(
    "/api/products?category=gpt&q=cache-check&utm_source=one",
  );
  assert.equal(first.headers.get("X-Cache"), "miss");
  const tracking = await call(
    "/api/products?q=cache-check&category=gpt&utm_source=two&fbclid=ignored",
  );
  assert.notEqual(tracking.headers.get("X-Cache"), "miss");
  assert.deepEqual(await tracking.json(), await first.json());
  const functional = await call("/api/products?category=claude&q=cache-check");
  assert.equal(functional.headers.get("X-Cache"), "miss");
  assert.equal(tracking.headers.get("X-Public-Cache-Expires"), null);
});

test("Cookie and Authorization requests neither use nor populate public caches", async () => {
  const credentials: Record<string, string>[] = [
    { Cookie: "session=test" },
    { Authorization: "Bearer test" },
  ];
  for (const headers of credentials) {
    for (const path of ["/api/products?auth-check=1", "/?auth-check=1"]) {
      const response = await call(path, { headers });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("X-Cache"), null);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    }
  }
  const anonymous = await call("/api/products?auth-check=1");
  assert.equal(anonymous.headers.get("X-Cache"), "miss");
  const signedIn = await call("/api/products?auth-check=1", {
    headers: { Cookie: "session=test" },
  });
  assert.equal(signedIn.headers.get("X-Cache"), null);
});

test("deployment cache namespaces change on release and retain explicit cache-busting parameters", () => {
  const version = (id: string) => ({ CF_VERSION_METADATA: { id } }) as Env;
  const request = new Request(
    "https://example.test/?cb=123&utm_campaign=ignored",
  );
  assert.notEqual(
    cacheKey(request, version("old")),
    cacheKey(request, version("new")),
  );
  assert.equal(
    new URL(cacheKey(request, version("new"))).searchParams.get("cb"),
    "123",
  );
  assert.equal(
    new URL(cacheKey(request, version("new"))).searchParams.has("utm_campaign"),
    false,
  );
});

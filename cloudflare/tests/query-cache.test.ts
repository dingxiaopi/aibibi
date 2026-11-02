import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchQuery,
  queryEntry,
  clearQueries,
  invalidateQueries,
  publicQuery,
  QUERY_TTL,
} from "../web/lib/query-cache";

test("public reads deduplicate simultaneous consumers, reuse recent data and revalidate after expiry", async () => {
  const path = "/api/products/cache-dedupe";
  let calls = 0;
  let resolve!: (value: unknown) => void;
  const promise = new Promise((done) => {
    resolve = done;
  });
  const load = async () => {
    calls++;
    return promise;
  };
  const first = fetchQuery(path, load),
    second = fetchQuery(path, load);
  resolve({ product: { id: "first" } });
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(queryEntry(path).state.loading, false);
  await fetchQuery(path, load);
  assert.equal(calls, 1);
  queryEntry(path).state.updatedAt = Date.now() - QUERY_TTL - 1;
  await fetchQuery(path, async () => {
    calls++;
    return { product: { id: "fresh" } };
  });
  assert.equal(calls, 2);
  assert.equal(queryEntry(path).state.data.product.id, "fresh");
});
test("query identity prevents different SKU/filter data from bleeding together; private endpoints are excluded", async () => {
  await fetchQuery("/api/products/sku-a", async () => ({ id: "a" }));
  assert.equal(queryEntry("/api/products/sku-b").state.data, null);
  assert.equal(queryEntry("/api/products?q=other").state.data, null);
  assert.equal(publicQuery("/api/admin/coverage"), false);
  assert.equal(publicQuery("/api/collector/state"), false);
  assert.equal(publicQuery("/api/products/sku-a"), true);
  assert.equal(publicQuery("/api/shops"), true);
});
test("background failures preserve known data, retry clears errors and authorization failure clears private preview data", async () => {
  const path = "/api/products/cache-error";
  await fetchQuery(path, async () => ({ price: 100 }));
  await fetchQuery(
    path,
    async () => {
      throw Error("connection failed");
    },
    true,
  );
  assert.equal(queryEntry(path).state.data.price, 100);
  assert.equal(queryEntry(path).state.loading, false);
  assert.match(queryEntry(path).state.error, /connection failed/);
  await fetchQuery(path, async () => ({ price: 101 }), true);
  assert.equal(queryEntry(path).state.error, "");
  assert.equal(queryEntry(path).state.data.price, 101);
  await fetchQuery(
    path,
    async () => {
      throw Object.assign(Error("login required"), { status: 401 });
    },
    true,
  );
  assert.equal(queryEntry(path).state.data, null);
});
test("logout invalidates pending requests so late responses cannot restore data, and mutations mark reads stale", async () => {
  const path = "/api/products/cache-reset";
  let resolve!: (value: unknown) => void;
  const old = fetchQuery(
    path,
    async () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  clearQueries();
  assert.equal(queryEntry(path).state.data, null);
  await fetchQuery(path, async () => ({ id: "new-session" }));
  resolve({ id: "old-session" });
  await old;
  assert.equal(queryEntry(path).state.data.id, "new-session");
  invalidateQueries();
  assert.equal(queryEntry(path).state.updatedAt, 0);
  let called = false;
  await fetchQuery(path, async () => {
    called = true;
    return { id: "updated" };
  });
  assert.equal(called, true);
});

test("server bootstrap skips the first public request and keeps original check timestamps", async () => {
  const { seedQueries } = await import("../web/lib/query-cache");
  const data = {
    product: { id: "bootstrap", checked_at: "2026-10-01T00:00:00Z" },
    quotes: [],
  };
  seedQueries({
    "/api/products/bootstrap": data,
    "/api/admin/private": { secret: true },
  });
  let calls = 0;
  await fetchQuery("/api/products/bootstrap", async () => {
    calls++;
    return {};
  });
  assert.equal(calls, 0);
  assert.deepEqual(queryEntry("/api/products/bootstrap").state.data, data);
  assert.equal(queryEntry("/api/admin/private").state.data, null);
  queryEntry("/api/products/bootstrap").state.updatedAt =
    Date.now() - QUERY_TTL - 1;
  await fetchQuery("/api/products/bootstrap", async () => {
    calls++;
    return {};
  });
  assert.equal(calls, 1);
});

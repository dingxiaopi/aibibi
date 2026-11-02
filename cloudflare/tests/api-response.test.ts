import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../web/lib/api";
import { fetchQuery, queryEntry } from "../web/lib/query-cache";

test("a successful HTML response becomes a retryable error rather than an empty successful query", async () => {
  const original = globalThis.fetch;
  const path = "/api/products/invalid-json-test";
  try {
    globalThis.fetch = async () =>
      new Response("<html>temporary proxy error</html>", { status: 200 });
    await assert.rejects(
      () => api(path),
      (error: Error & { status?: number }) =>
        error.status === 502 && error.message.includes("格式异常"),
    );
    await fetchQuery(path, (signal) => api(path, { signal }));
    assert.equal(queryEntry(path).state.data, null);
    assert.equal(queryEntry(path).state.loading, false);
    assert.match(queryEntry(path).state.error, /格式异常/);
    globalThis.fetch = async () =>
      Response.json({ product: { id: "recovered" }, quotes: [] });
    await fetchQuery(path, (signal) => api(path, { signal }), true);
    assert.equal(queryEntry(path).state.data.product.id, "recovered");
    assert.equal(queryEntry(path).state.error, "");
  } finally {
    globalThis.fetch = original;
  }
});

test("non-JSON HTTP errors preserve status, and JSON HTTP errors keep their actionable message", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response("rate limited", { status: 429 });
    await assert.rejects(
      () => api("/api/admin/reviews"),
      (error: Error & { status?: number }) => error.status === 429,
    );
    globalThis.fetch = async () =>
      Response.json({ error: "审核记录已变化，请重新核验" }, { status: 409 });
    await assert.rejects(() => api("/api/admin/reviews"), /审核记录已变化/);
  } finally {
    globalThis.fetch = original;
  }
});

test("successful GET responses keep shared results fresh and remain independent of write invalidation", async () => {
  const original = globalThis.fetch;
  const path = "/api/shops/api-get-test";
  try {
    globalThis.fetch = async () =>
      Response.json({ shop: { id: "S123" }, quotes: [], hours: 48 });
    await fetchQuery(path, (signal) => api(path, { signal }));
    const at = queryEntry(path).state.updatedAt;
    assert.ok(at > 0);
    await api("/api/shops");
    assert.equal(queryEntry(path).state.updatedAt, at);
  } finally {
    globalThis.fetch = original;
  }
});

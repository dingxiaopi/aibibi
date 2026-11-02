import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Shared Node/browser helper.
import { localBatches } from "../shared/local-batches.mjs";
// @ts-expect-error Node export helper.
import { exportBundle } from "../shared/export-bundle.mjs";
// @ts-expect-error Node transport helper.
import { transferSender } from "../shared/push-transport.mjs";

test("compact batches isolate fingerprints by quote and preserve legacy transfer hashes", () => {
  const bundle = {
    shops: [{ id: "A" }, { id: "B" }],
    product_definitions: [],
    mapping_updates: [],
    review_items: [],
    quotes: [
      { id: "A:G1", shop_id: "A", source_goods_id: "G1" },
      { id: "B:G1", shop_id: "B", source_goods_id: "G1" },
    ],
    mapping_fingerprints: {
      "A:G1": "first",
      "B:G1": "second",
      G1: "fallback",
      unused: "unused",
    },
  };
  const legacy = localBatches(bundle);
  assert.ok(
    legacy.every(
      (b: any) => b.mapping_fingerprints === bundle.mapping_fingerprints,
    ),
  );
  const compact = localBatches({ ...bundle, transfer_format: 2 });
  assert.deepEqual(
    compact
      .filter((b: any) => b.quotes.length)
      .map((b: any) => b.mapping_fingerprints),
    [{ "A:G1": "first" }, { "B:G1": "second" }],
  );
  assert.ok(
    compact
      .filter((b: any) => !b.quotes.length)
      .every((b: any) => Object.keys(b.mapping_fingerprints).length === 0),
  );
  assert.deepEqual(
    compact.flatMap((b: any) => b.quotes),
    bundle.quotes,
  );
});

test("delta export skips only exact same-destination definitions and mappings", () => {
  const product = {
    id: "plus",
    category: "gpt",
    name: "Plus",
    spec: "30天",
    channel: "iOS",
  };
  const mapping = {
    shop_id: "A",
    sku: "plus",
    accepted_fingerprint: "f",
    channel: "iOS",
    warranty: "保",
    spec_evidence: "30天",
    restriction: "无",
  };
  const config = {
    products: [product],
    mappings: {},
    mapping_updates: [{ shop_id: "A", goods_id: "G1", mapping }],
  };
  const snapshot = {
    generated_at: new Date().toISOString(),
    shops: [],
    quotes: [],
    review_items: [],
  };
  const state = {
    destination: "https://example.test",
    synced_at: new Date().toISOString(),
    products: [{ ...product, min_price: 10 }],
    mapping_states: [
      {
        shop_id: "A",
        source_id: "G1",
        fingerprint: "f",
        mapping_data: JSON.stringify(mapping),
      },
    ],
  };
  const exported = exportBundle(snapshot, config, state, state.destination);
  assert.equal(exported.product_definitions.length, 0);
  assert.equal(exported.mapping_updates.length, 0);
  for (const changed of [
    {
      ...config,
      mapping_updates: [
        {
          ...config.mapping_updates[0],
          mapping: { ...mapping, sku: "another" },
        },
      ],
    },
    {
      ...config,
      mapping_updates: [
        {
          ...config.mapping_updates[0],
          mapping: { ...mapping, warranty: "不同" },
        },
      ],
    },
  ])
    assert.equal(
      exportBundle(snapshot, changed, state, state.destination).mapping_updates
        .length,
      1,
    );
  assert.equal(
    exportBundle(snapshot, config, state, "https://other.test").mapping_updates
      .length,
    1,
  );
  assert.equal(
    exportBundle(
      snapshot,
      config,
      { ...state, synced_at: "2020-01-01" },
      state.destination,
    ).product_definitions.length,
    1,
  );
  assert.equal(
    exportBundle(
      snapshot,
      config,
      { ...state, mapping_states: [] },
      state.destination,
    ).mapping_updates.length,
    1,
  );
  assert.equal(
    exportBundle(
      snapshot,
      { ...config, products: [{ ...product, spec: "不同" }] },
      state,
      state.destination,
    ).product_definitions.length,
    1,
  );
});

test("transport replays identical batch through network errors, timeout leases and 503", async () => {
  const calls: string[] = [],
    delays: number[] = [];
  const responses = [
    () => {
      throw new TypeError("fetch failed");
    },
    () =>
      new Response(
        JSON.stringify({ error: "该任务正在处理，请稍后继续同一采集包" }),
        { status: 409 },
      ),
    () => new Response("unavailable", { status: 503 }),
    () => new Response(JSON.stringify({ ok: true })),
  ];
  const send = transferSender("https://example.test", "test-token", {
    fetchImpl: async (_url: string, init: RequestInit) => {
      calls.push(init.body as string);
      return responses.shift()!();
    },
    sleep: async (delay: number) => {
      delays.push(delay);
    },
  });
  assert.deepEqual(
    await send("ingest", { transfer: { id: "id", index: 2 }, quotes: [] }),
    { ok: true },
  );
  assert.equal(new Set(calls).size, 1);
  assert.deepEqual(delays, [2000, 4000, 8000]);
});

test("transport never retries auth errors or mapping conflicts; transient retries are bounded", async () => {
  for (const status of [400, 401, 403, 409]) {
    let calls = 0;
    const send = transferSender("https://example.test", "token", {
      fetchImpl: async () => {
        calls++;
        return new Response(
          JSON.stringify({ error: "后台审核记录已变化，请先同步后重新审核" }),
          { status },
        );
      },
      sleep: async () => {
        assert.fail("business error must not wait");
      },
    });
    await assert.rejects(
      () => send("ingest", {}),
      new RegExp(`HTTP ${status}`),
    );
    assert.equal(calls, 1);
  }
  let calls = 0;
  const send = transferSender("https://example.test", "token", {
    attempts: 3,
    fetchImpl: async () => {
      calls++;
      throw Error("network");
    },
    sleep: async () => {},
  });
  await assert.rejects(() => send("ingest", {}), /尝试 3 次/);
  assert.equal(calls, 3);
});

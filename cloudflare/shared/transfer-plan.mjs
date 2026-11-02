import { localBatches } from "./local-batches.mjs";
const digest = async (value) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
export async function transferPlan(bundle) {
  const batches = localBatches(bundle);
  const hashes = [];
  // Sequential hashing also works in browsers without allocating all encoded batches at once.
  for (const batch of batches) hashes.push(await digest(JSON.stringify(batch)));
  const manifest = {
    hashes,
    source_at: bundle.generated_at || null,
    counts: {
      shops: bundle.shops.length,
      quotes: bundle.quotes.length,
      review_items: bundle.review_items.length,
      mapping_updates: bundle.mapping_updates?.length || 0,
      products: bundle.product_definitions?.length || 0,
    },
  };
  return {
    registration: { id: await digest(JSON.stringify(manifest)), ...manifest },
    batches,
  };
}

/** Both browser imports and the CLI resume using the server's durable receipt count. */
export async function pushBundle(bundle, send, progress = () => {}) {
  const { registration, batches } = await transferPlan(bundle);
  const state = await send("transfers", registration);
  const start = Number(state.done_batches);
  if (!Number.isSafeInteger(start) || start < 0 || start > batches.length)
    throw Error("服务器返回的推送进度无效");
  progress({
    id: registration.id,
    done: start,
    total: batches.length,
    resumed: start,
  });
  for (let index = start; index < batches.length; index++) {
    try {
      await send("ingest", {
        ...batches[index],
        transfer: { id: registration.id, index },
      });
    } catch (error) {
      throw Error(
        `第 ${index + 1}/${batches.length} 批未完成：${error.message}。已完成批次保留，修复后使用同一文件重跑可继续。`,
      );
    }
    progress({
      id: registration.id,
      done: index + 1,
      total: batches.length,
      resumed: start,
    });
  }
  return {
    ok: true,
    id: registration.id,
    batches: batches.length,
    resumed: start,
    ...registration.counts,
  };
}

import {
  transferStateSelectLocalTransfers,
  beginTransferInsertLocalTransfers,
  ingestTrackedSelectLocalTransfers,
  ingestTrackedUpdateLocalTransfers,
  ingestTrackedUpdateLocalTransfers2,
  recordFailureUpdateLocalTransfers,
} from "./repo/local_transfers";
import {
  ingestTrackedInsertLocalTransferBatches,
  ingestTrackedUpdateLocalTransferBatches,
  recordFailureUpdateLocalTransferBatches,
} from "./repo/local_transfer_batches";
import { body, json } from "./auth";
import { hash, now, obj, text, type Obj } from "./domain";
import { ingestExternal } from "./external";

type Transfer = {
  id: string;
  manifest: string;
  total_batches: number;
  done_batches: number;
  status: string;
  lease_token: string | null;
  lease_until: string | null;
};
const validId = (id: string) => /^[a-f0-9]{64}$/.test(id);

export async function transferState(env: Env, id: string) {
  if (!validId(id)) return json({ error: "推送任务ID无效" }, 400);
  const run = await transferStateSelectLocalTransfers(env)
    .bind(id)
    .first<Obj>();
  if (!run) return json({ error: "推送任务不存在" }, 404);
  return json({ ...run, counts: JSON.parse(text(run.counts)) });
}

/** The plan commits to each batch's content and order, never to an import timestamp. */
export async function beginTransfer(request: Request, env: Env) {
  const b = await body(request, 256 * 1024);
  const hashes = b.hashes;
  const counts = obj(b.counts);
  if (
    !Array.isArray(hashes) ||
    !hashes.length ||
    hashes.length > 2000 ||
    !hashes.every((h) => typeof h === "string" && validId(h)) ||
    !["shops", "quotes", "review_items", "mapping_updates", "products"].every(
      (key) =>
        Number.isSafeInteger(counts[key]) &&
        Number(counts[key]) >= 0 &&
        Number(counts[key]) <= 100000,
    ) ||
    (b.source_at !== null &&
      (typeof b.source_at !== "string" ||
        !Number.isFinite(Date.parse(b.source_at)) ||
        Date.parse(b.source_at) > Date.now() + 300000))
  )
    return json({ error: "推送计划格式或原始时间无效" }, 400);
  const manifest = JSON.stringify({ hashes, source_at: b.source_at, counts });
  const id = await hash(manifest);
  if (b.id !== id) return json({ error: "推送计划摘要不一致" }, 400);
  await beginTransferInsertLocalTransfers(env)
    .bind(
      id,
      manifest,
      b.source_at,
      JSON.stringify(counts),
      hashes.length,
      now(),
      now(),
    )
    .run();
  return transferState(env, id);
}

/** Old untracked bundles remain compatible. Tracked batches are sequential and resumable. */
export async function ingestTracked(request: Request, env: Env) {
  const b = await body(request, 4 * 1024 * 1024);
  if (b.transfer == null)
    return ingestExternal(
      new Request(request.url, { method: "POST", body: JSON.stringify(b) }),
      env,
    );
  if (Array.isArray(b.review_items) && b.review_items.length > 15)
    return json(
      { error: "带进度记录的每批候选最多15条，请使用最新推送脚本" },
      413,
    );
  const transfer = obj(b.transfer),
    id = text(transfer.id),
    index = transfer.index;
  if (!validId(id) || !Number.isSafeInteger(index) || Number(index) < 0)
    return json({ error: "推送批次标识无效" }, 400);
  const run = await ingestTrackedSelectLocalTransfers(env)
    .bind(id)
    .first<Transfer>();
  if (!run) return json({ error: "请先登记推送计划" }, 404);
  const payload = { ...b };
  delete payload.transfer;
  const hashes = obj(JSON.parse(run.manifest)).hashes as string[];
  if (
    Number(index) >= hashes.length ||
    hashes[Number(index)] !== (await hash(JSON.stringify(payload)))
  )
    return json(
      { error: "本批内容与推送计划不一致，请重新导出并登记计划" },
      409,
    );
  if (Number(index) < run.done_batches)
    return json({
      ok: true,
      skipped: true,
      index,
      done_batches: run.done_batches,
    });
  if (Number(index) !== run.done_batches)
    return json(
      { error: "请先完成前面的批次", next_index: run.done_batches },
      409,
    );
  const lease = crypto.randomUUID();
  const acquired = await ingestTrackedUpdateLocalTransfers(env)
    .bind(
      lease,
      new Date(Date.now() + 120000).toISOString(),
      now(),
      id,
      index,
      now(),
    )
    .run();
  if (!acquired.meta.changes)
    return json({ error: "该任务正在处理，请稍后继续同一采集包" }, 409);
  try {
    await ingestTrackedInsertLocalTransferBatches(env)
      .bind(id, index, now())
      .run();
    const result = await ingestExternal(
      new Request(request.url, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
      env,
    );
    if (!result.ok) {
      const data = obj(
        await result
          .clone()
          .json()
          .catch(() => ({})),
      );
      await recordFailure(
        env,
        id,
        Number(index),
        lease,
        text(data.error) || "批次导入失败",
      );
      return result;
    }
    const saved = await env.DB.batch([
      ingestTrackedUpdateLocalTransferBatches(env).bind(
        now(),
        id,
        index,
        id,
        lease,
      ),
      ingestTrackedUpdateLocalTransfers2(env).bind(now(), now(), id, lease),
    ]);
    if (!saved[1].meta.changes)
      return json({ error: "处理租约已变化，请重新继续同一采集包" }, 409);
    return result;
  } catch (error) {
    await recordFailure(
      env,
      id,
      Number(index),
      lease,
      "批次处理异常，请修复后继续；本批可能已部分写入",
    );
    throw error;
  }
}
async function recordFailure(
  env: Env,
  id: string,
  index: number,
  lease: string,
  error: string,
) {
  await env.DB.batch([
    recordFailureUpdateLocalTransferBatches(env).bind(
      now(),
      error.slice(0, 500),
      id,
      index,
      id,
      lease,
    ),
    recordFailureUpdateLocalTransfers(env).bind(
      now(),
      error.slice(0, 500),
      index,
      id,
      lease,
    ),
  ]);
}

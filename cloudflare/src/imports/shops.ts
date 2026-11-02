import {
  updateShopUpdateShops,
  updateShopUpdateShops2,
  updateShopUpdateShops3,
} from "../repo/shops";
import { json, audit } from "../auth";
import { obj, text, plain, type Shop, type Obj } from "../domain";
import { stamp } from "./common";
export async function updateShop(env: Env, b: Obj, shopId: string, shop: Shop) {
  if (
    !(b.status === "ok" ? stamp(b.checked_at) : stamp(b.attempted_at)) ||
    !["ok", "failed", "disabled"].includes(text(b.status)) ||
    !Number.isSafeInteger(b.source_item_count) ||
    Number(b.source_item_count) < 0
  )
    return json({ error: "无效采集状态或时间" }, 400);
  if (b.status === "disabled") {
    const evidence = obj(b.closure_evidence);
    if (
      !stamp(b.disabled_at) ||
      !plain(b.disabled_reason) ||
      evidence.url !== shop.url ||
      !stamp(evidence.confirmed_at) ||
      !plain(evidence.response)
    )
      return json({ error: "停用店铺须携带原店关闭证据和确认时间" }, 400);
  }
  const shopUpdate = await updateShopUpdateShops(env)
    .bind(
      text(b.status),
      stamp(b.checked_at) ? text(b.checked_at) : null,
      Number(b.source_item_count),
      stamp(b.attempted_at) ? text(b.attempted_at) : text(b.checked_at),
      b.status !== "ok" ? text(b.error).slice(0, 200) : null,
      shopId,
      stamp(b.attempted_at) ? text(b.attempted_at) : text(b.checked_at),
    )
    .run();
  if (!shopUpdate.meta.changes) return json({ ok: true, updated: false });
  if (b.status === "disabled")
    await updateShopUpdateShops2(env)
      .bind(
        text(b.disabled_at),
        plain(b.disabled_reason),
        JSON.stringify(b.closure_evidence),
        shopId,
      )
      .run();
  if (typeof b.collection_paused === "boolean")
    await updateShopUpdateShops3(env)
      .bind(
        b.collection_paused ? "true" : "false",
        text(b.pause_reason).slice(0, 200),
        shopId,
        text(b.attempted_at || b.checked_at),
      )
      .run();
  await audit(env, "external_shop", shopId);
  return json({ ok: true });
}

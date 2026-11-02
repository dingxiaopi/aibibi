import { importMappingSelectProducts } from "../repo/products";
import {
  importMappingSelectMappings,
  importMappingInsertMappings,
} from "../repo/mappings";
import {
  importMappingSelectGoods,
  importMappingInsertGoods,
} from "../repo/goods";
import { importMappingUpdateQuotes } from "../repo/quotes";
import { json, audit } from "../auth";
import { obj, text, fingerprint, plain, type Shop, type Obj } from "../domain";
import { stamp } from "./common";
export async function importMapping(
  env: Env,
  b: Obj,
  shopId: string,
  shop: Shop,
) {
  const m = obj(b.mapping),
    raw = obj(b.raw),
    gid = text(b.goods_id);
  const validId =
    shop.platform === "16688"
      ? /^G\d+$/.test(gid)
      : shop.platform === "wzyp" || shop.platform === "catfk"
        ? (shop.platform === "wzyp"
            ? /^W[A-Za-z0-9_]+$/
            : /^C[A-Za-z0-9_]+$/
          ).test(gid)
        : shop.platform === "acg" && /^N\d+(?:V\d+)?$/.test(gid);
  if (
    !validId ||
    raw.goods_no !== gid ||
    raw.shop_no !== shopId ||
    !stamp(b.reviewed_at) ||
    m.shop_id !== shopId ||
    ![m.sku, m.channel, m.warranty, m.spec_evidence, m.restriction].every(
      (x) => typeof x === "string" && x.trim().length > 0 && x.length <= 1000,
    ) ||
    !/^[a-f0-9]{64}$/.test(text(m.accepted_fingerprint)) ||
    (await fingerprint(raw)) !== m.accepted_fingerprint ||
    /补差价/.test(plain(raw.name))
  )
    return json({ error: "审核映射、详情指纹或原始时间无效" }, 400);
  if (!(await importMappingSelectProducts(env).bind(text(m.sku)).first()))
    return json({ error: "规格不存在" }, 400);
  const previous = await importMappingSelectMappings(env)
    .bind(shopId, gid)
    .first<{ fingerprint: string; data: string }>();
  const same =
    previous?.fingerprint === m.accepted_fingerprint &&
    ["sku", "channel", "warranty", "spec_evidence", "restriction"].every(
      (key) => obj(JSON.parse(previous.data))[key] === m[key],
    );
  if (same) return json({ ok: true, updated: false });
  const decision = await importMappingSelectGoods(env)
    .bind(shopId + ":" + gid)
    .first<{ review_status: string; data_at: string }>();
  if (
    decision?.review_status === "rejected" &&
    Date.parse(text(b.reviewed_at)) <= Date.parse(decision.data_at)
  )
    return json({ error: "该商品已被人工排除，需要新的本地复核才能恢复" }, 409);
  if ((previous?.fingerprint ?? null) !== b.previous_fingerprint)
    return json(
      {
        error: "后台审核记录已变化，请先同步后重新审核",
        shop_id: shopId,
        goods_id: gid,
      },
      409,
    );
  const results = await env.DB.batch([
    importMappingInsertMappings(env).bind(
      shopId,
      gid,
      text(m.sku),
      text(m.accepted_fingerprint),
      JSON.stringify(m),
      shopId,
      gid,
      b.previous_fingerprint == null ? null : text(b.previous_fingerprint),
      shopId + ":" + gid,
      text(b.reviewed_at),
    ),
    importMappingInsertGoods(env).bind(
      shopId + ":" + gid,
      shopId,
      gid,
      plain(raw.name).slice(0, 500),
      text(m.accepted_fingerprint),
      JSON.stringify(raw),
      text(b.reviewed_at),
    ),
    importMappingUpdateQuotes(env).bind(shopId + ":" + gid),
  ]);
  if (!results[0].meta.changes)
    return json({ error: "审核记录在导入期间变化，请同步后重新审核" }, 409);
  await audit(env, "external_mapping", shopId + ":" + gid);
  return json({ ok: true, updated: true });
}

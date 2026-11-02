import { importQuoteSelectMappings } from "../repo/mappings";
import { importQuoteSelectGoods } from "../repo/goods";
import { importQuoteInsertQuotes } from "../repo/quotes";
import { importQuoteInsertObservations } from "../repo/observations";
import { json } from "../auth";
import { obj, text, fingerprint, type Shop, type Obj } from "../domain";
import { stamp } from "./common";
export async function importQuote(
  env: Env,
  b: Obj,
  shopId: string,
  shop: Shop,
) {
  const q = obj(b.quote),
    gid = text(q.source_goods_id),
    id = shopId + ":" + gid;
  const mapping = await importQuoteSelectMappings(env)
    .bind(shopId, gid)
    .first<{ data: string; fingerprint: string; sku: string }>();
  if (
    !mapping ||
    mapping.fingerprint !== b.mapping_fingerprint ||
    q.sku !== mapping.sku ||
    q.id !== id ||
    q.shop_id !== shopId
  )
    return json(
      { error: "商品归类指纹与后台审核记录不一致，不能直接导入报价" },
      409,
    );
  if (
    typeof q.price !== "number" ||
    !Number.isFinite(q.price) ||
    q.price <= 0 ||
    q.currency !== "CNY" ||
    !stamp(q.checked_at) ||
    (q.attempted_at != null &&
      (!stamp(q.attempted_at) ||
        Date.parse(text(q.attempted_at)) < Date.parse(text(q.checked_at)))) ||
    (q.inventory_checked_at && !stamp(q.inventory_checked_at)) ||
    !["ok", "failed", "needs_review", "not_listed"].includes(
      text(q.collection_status),
    ) ||
    !["listed", "not_listed"].includes(text(q.listing_status)) ||
    !["in_stock", "out", "unknown"].includes(text(q.stock_status)) ||
    !["ready", "unknown", "delayed"].includes(text(q.availability)) ||
    (q.stock_count != null &&
      (!Number.isSafeInteger(q.stock_count) || Number(q.stock_count) < 0))
  )
    return json({ error: "报价字段或原始时间无效" }, 400);
  if (
    (q.stock_status === "in_stock" && q.stock_count === 0) ||
    (q.stock_status === "out" && Number(q.stock_count) > 0) ||
    (q.availability === "ready" && q.stock_status !== "in_stock")
  )
    return json({ error: "库存数量与可用状态冲突" }, 400);
  const stored = await importQuoteSelectGoods(env)
    .bind(id)
    .first<{ raw: string }>();
  const sourcePath = stored?.raw
    ? text(obj(JSON.parse(stored.raw)).source_path)
    : "";
  const expected =
    shop.platform === "wzyp" || shop.platform === "catfk"
      ? "https://" +
        (shop.platform === "wzyp" ? "wzyp.cn" : "catfk.com") +
        "/item/" +
        gid.slice(1)
      : shop.platform === "16688"
        ? "https://www.16688.com.cn/goods/" + gid
        : shop.platform === "acg" && /^N\d+(?:V\d+)?$/.test(gid)
          ? shop.url.replace(/\/$/, "") +
            (/^\/products\/(?:[A-Za-z0-9_-]|%[0-9A-Fa-f]{2})+$/.test(sourcePath)
              ? sourcePath
              : "/item/" + gid.slice(1))
          : "";
  if (!expected || q.item_url !== expected)
    return json({ error: "商品来源链接不匹配" }, 400);
  const m = obj(JSON.parse(mapping.data));
  const value = {
    ...q,
    channel: m.channel,
    warranty: m.warranty,
    spec_evidence: m.spec_evidence,
    acquisition_method: "external_local",
  };
  const result = await importQuoteInsertQuotes(env)
    .bind(id, shopId, mapping.sku, JSON.stringify(value))
    .run();
  if (q.collection_status === "ok")
    await importQuoteInsertObservations(env)
      .bind(id, mapping.sku, text(q.checked_at), q.price, JSON.stringify(value))
      .run();
  return json({ ok: true, updated: Boolean(result.meta.changes) });
}

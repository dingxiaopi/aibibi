import { json, body } from "../auth";
import { obj, text } from "../domain";
import { importExternal } from "../external";
const MAX_BUNDLE_BYTES = 4 * 1024 * 1024;
export async function ingestExternal(request: Request, env: Env) {
  const b = await body(request, MAX_BUNDLE_BYTES);
  if (
    b.schema_version !== 1 ||
    !Array.isArray(b.shops) ||
    !Array.isArray(b.quotes) ||
    !Array.isArray(b.review_items) ||
    !b.mapping_fingerprints ||
    typeof b.mapping_fingerprints !== "object"
  )
    return json({ error: "采集包格式不正确" }, 400);
  if (
    b.shops.length > 1 ||
    b.quotes.length > 5 ||
    b.review_items.length > 20 ||
    (b.mapping_updates != null &&
      (!Array.isArray(b.mapping_updates) ||
        b.mapping_updates.length > 1 ||
        (b.mapping_updates.length && b.shops.length))) ||
    (b.product_definitions != null &&
      (!Array.isArray(b.product_definitions) ||
        b.product_definitions.length > 1 ||
        (b.product_definitions.length &&
          (b.shops.length ||
            b.quotes.length ||
            b.review_items.length ||
            (Array.isArray(b.mapping_updates) && b.mapping_updates.length)))))
  )
    return json(
      {
        error:
          "请使用 push:local 分批推送：每批1店、5条报价、20条候选；映射单独推送",
      },
      413,
    );
  const shopIds = new Set(b.shops.map((s) => obj(s).id));
  if (
    b.quotes.some((q) => !shopIds.has(obj(q).shop_id)) ||
    b.review_items.some((r) => !shopIds.has(obj(r).shop_id))
  )
    return json({ error: "报价或候选不属于本批店铺" }, 400);

  const origin = new URL(request.url).origin;
  let processed = 0;
  for (const product of (b.product_definitions as unknown[] | undefined) ||
    []) {
    const result = await importExternal(
      new Request(origin + "/api/ingest", {
        method: "POST",
        body: JSON.stringify({ kind: "product", product }),
      }),
      env,
    );
    if (!result.ok) return result;
  }
  for (const update of (b.mapping_updates as unknown[] | undefined) || []) {
    const result = await importExternal(
      new Request(origin + "/api/ingest", {
        method: "POST",
        body: JSON.stringify({ ...obj(update), kind: "mapping" }),
      }),
      env,
    );
    if (!result.ok) return result;
  }
  for (const shop of b.shops) {
    const s = obj(shop);
    const shopId = text(s.id);
    const result = await importExternal(
      new Request(origin + "/api/ingest", {
        method: "POST",
        body: JSON.stringify({
          kind: "shop",
          shop: s,
          shop_id: shopId,
          status: s.collection_status,
          checked_at: s.checked_at,
          attempted_at: s.attempted_at,
          source_item_count: s.source_item_count || 0,
          error: s.error,
          disabled_at: s.disabled_at,
          disabled_reason: s.disabled_reason,
          closure_evidence: s.closure_evidence,
          collection_paused: s.collection_paused,
          pause_reason: s.pause_reason,
        }),
      }),
      env,
    );
    if (!result.ok) return result;
    const quotes = b.quotes.filter((q) => obj(q).shop_id === shopId);
    for (const quote of quotes) {
      const q = obj(quote);
      const result = await importExternal(
        new Request(origin + "/api/ingest", {
          method: "POST",
          body: JSON.stringify({
            kind: "quote",
            shop_id: shopId,
            quote,
            mapping_fingerprint:
              obj(b.mapping_fingerprints)[
                shopId + ":" + text(q.source_goods_id)
              ] ?? obj(b.mapping_fingerprints)[text(q.source_goods_id)],
          }),
        }),
        env,
      );
      if (!result.ok) return result;
      processed++;
    }
    const reviews = b.review_items.filter((r) => obj(r).shop_id === shopId);
    for (let i = 0; i < reviews.length; i += 20) {
      const result = await importExternal(
        new Request(origin + "/api/ingest", {
          method: "POST",
          body: JSON.stringify({
            kind: "reviews",
            shop_id: shopId,
            items: reviews.slice(i, i + 20),
            checked_at: s.checked_at,
          }),
        }),
        env,
      );
      if (!result.ok) return result;
    }
  }
  return json({ ok: true, shops: b.shops.length, quotes: processed });
}

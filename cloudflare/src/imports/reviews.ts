import { importReviewsInsertGoods } from "../repo/goods";
import { json } from "../auth";
import { obj, text, type Shop, type Obj } from "../domain";
import { stamp } from "./common";
export async function importReviews(
  env: Env,
  b: Obj,
  shopId: string,
  shop: Shop,
) {
  if (!Array.isArray(b.items) || b.items.length > 20 || !stamp(b.checked_at))
    return json({ error: "审核列表或时间无效" }, 400);
  const statements = [];
  for (const x of b.items) {
    const r = obj(x);
    if (
      r.shop_id !== shopId ||
      !text(r.goods_id).match(/^(?:G\d+|[WC][A-Za-z0-9_]+|N\d+(?:V\d+)?)$/)
    )
      return json({ error: "审核商品身份不匹配" }, 400);
    statements.push(
      importReviewsInsertGoods(env).bind(
        shopId + ":" + text(r.goods_id),
        shopId,
        text(r.goods_id),
        text(r.name).slice(0, 500),
        text(b.checked_at),
        text(r.reason).slice(0, 500),
      ),
    );
  }
  if (statements.length) await env.DB.batch(statements);
  return json({ ok: true });
}

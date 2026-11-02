import { importExternalSelectShops } from "./repo/shops";
import { body, json } from "./auth";
import { text, type Shop } from "./domain";
import { importProduct } from "./imports/products";
import { registerShop } from "./imports/register-shop";
import { updateShop } from "./imports/shops";
import { importMapping } from "./imports/mappings";
import { importQuote } from "./imports/quotes";
import { importReviews } from "./imports/reviews";
export { ingestExternal } from "./imports/ingest";
export async function importExternal(request: Request, env: Env) {
  const b = await body(request, 32768);
  if (b.kind === "product") return importProduct(env, b, "");
  const shopId = text(b.shop_id);
  if (b.kind === "shop" && b.shop) {
    const error = await registerShop(env, b, shopId);
    if (error) return error;
  }
  const shop = await importExternalSelectShops(env).bind(shopId).first<Shop>();
  if (!shop) return json({ error: "店铺未登记，导入不会增加店铺" }, 400);

  if (b.kind === "shop") return updateShop(env, b, shopId, shop);
  if (b.kind === "mapping") return importMapping(env, b, shopId, shop);
  if (b.kind === "quote") return importQuote(env, b, shopId, shop);
  if (b.kind === "reviews") return importReviews(env, b, shopId, shop);
  return json({ error: "未知导入类型" }, 400);
}

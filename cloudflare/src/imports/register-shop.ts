import { MAX_SHOPS } from "../../shared/site";
import {
  registerShopSelectShops,
  registerShopInsertShops,
} from "../repo/shops";
import { json, audit } from "../auth";
import { obj, text, plain, type Obj } from "../domain";
import { stamp } from "./common";
export async function registerShop(env: Env, b: Obj, shopId: string) {
  const s = obj(b.shop),
    platform = text(s.platform),
    token = text(s.source_token || s.id);
  let expected = "";
  if (platform === "16688" && /^S\d+$/.test(shopId))
    expected = "https://www.16688.com.cn/shop/" + shopId;
  if (
    ["wzyp", "catfk"].includes(platform) &&
    /^[A-Za-z0-9_-]+$/.test(token) &&
    shopId === (platform === "wzyp" ? "W_" : "C_") + token
  )
    expected =
      "https://" +
      (platform === "wzyp" ? "wzyp.cn" : "catfk.com") +
      "/shop/" +
      token;
  if (platform === "acg" && /^A_[a-z0-9_]{2,70}$/.test(shopId)) {
    try {
      const u = new URL(text(s.origin));
      if (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !u.port &&
        u.pathname === "/" &&
        !u.search &&
        !u.hash &&
        u.origin === s.origin
      )
        expected = u.origin + "/";
    } catch {}
  }
  // Existing legacy directory-only independent stores do not use registration.
  const exists = await registerShopSelectShops(env).bind(shopId).first();
  if (!exists) {
    if (
      !expected ||
      s.id !== shopId ||
      s.url !== expected ||
      !plain(s.name) ||
      text(s.name).length > 200 ||
      !["ok", "failed", "disabled"].includes(text(b.status)) ||
      !(b.status === "ok" ? stamp(b.checked_at) : stamp(b.attempted_at)) ||
      !Number.isSafeInteger(b.source_item_count) ||
      Number(b.source_item_count) < 0
    )
      return json(
        { error: "新增店铺须携带完整源站身份、有效来源URL和实际采集时间" },
        400,
      );
    const result = await registerShopInsertShops(env)
      .bind(
        shopId,
        platform,
        platform === "acg" ? text(s.origin) : token,
        plain(s.name),
        expected,
        JSON.stringify(s),
        stamp(b.checked_at) ? text(b.checked_at) : null,
      )
      .run();
    if (!result.meta.changes) {
      // A concurrent retry for the same shop is idempotent; a different shop may hit capacity.
      if (!(await registerShopSelectShops(env).bind(shopId).first()))
        return json({ error: `最多接入${MAX_SHOPS}家店铺` }, 409);
    } else await audit(env, "external_register_shop", shopId);
  }
}

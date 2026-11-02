import {
  importProductInsertProducts,
  importProductSelectProducts,
} from "../repo/products";
import { json } from "../auth";
import { obj, text, type Obj } from "../domain";

export async function importProduct(env: Env, b: Obj, shopId: string) {
  const p = obj(b.product);
  const keys = [
    "id",
    "category",
    "name",
    "spec",
    "channel",
    "logo",
    "brand",
    "family",
    "kind",
  ];
  if (
    !/^[a-z][a-z0-9-]{1,79}$/.test(text(p.id)) ||
    !["gpt", "claude", "grok", "gemini", "cursor", "other"].includes(
      text(p.category),
    ) ||
    ![p.name, p.spec, p.channel].every(
      (x) => typeof x === "string" && x.trim().length > 0 && x.length <= 500,
    ) ||
    [p.logo, p.brand, p.family, p.kind].some(
      (x) => x != null && (typeof x !== "string" || x.length > 100),
    )
  )
    return json({ error: "商品规格定义无效" }, 400);
  const value = Object.fromEntries(
    keys.filter((key) => p[key] != null).map((key) => [key, p[key]]),
  );
  const serialized = JSON.stringify(value);
  await importProductInsertProducts(env)
    .bind(text(p.id), text(p.category), serialized)
    .run();
  const saved = await importProductSelectProducts(env)
    .bind(text(p.id))
    .first<{ data: string }>();
  if (
    !saved ||
    !keys.every(
      (key) => text(obj(JSON.parse(saved.data))[key]) === text(value[key]),
    )
  )
    return json(
      {
        error: "规格ID已存在且定义不同；请为不同渠道或交付方式创建独立规格",
        id: p.id,
      },
      409,
    );
  return json({ ok: true, id: p.id });
}

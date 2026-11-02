import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { publicData, type PublicContext } from "../src/services/public-data";
import { quoteList, publicShops } from "../src/services/catalog";
import { productsSelectProducts } from "../src/repo/products";

test("shared public catalog matches SQL ordering and joins and is scoped to one request", async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch() {return new Response('test')}}",
      compatibilityDate: "2026-10-13",
      d1Databases: { DB: "catalog-equivalence" },
    }),
  );
  try {
    const db = await mf.getD1Database("DB");
    for (const file of [
      "0001_initial.sql",
      "0002_idempotent_shop_import.sql",
      "0003_external_collection.sql",
    ])
      await db.exec(readFileSync(`migrations/${file}`, "utf8"));
    const checked_at = new Date().toISOString();
    for (const [i, name] of ["😀", "中文", "\uE000", "Alpha"].entries()) {
      await db
        .prepare(
          "INSERT INTO shops(id,platform,name,url,data,enabled,status,checked_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .bind(
          String(i),
          i % 2 ? "acg" : "wzyp",
          name,
          "https://example.test",
          JSON.stringify({ name: "stale name" }),
          i === 1 ? 0 : 1,
          "ok",
          checked_at,
        )
        .run();
      const product = { id: `p${i}`, category: "json-category", name };
      await db
        .prepare("INSERT INTO products VALUES(?,?,?)")
        .bind(product.id, name, JSON.stringify(product))
        .run();
      const quote = {
        id: `q${i}`,
        shop_id: String(i),
        sku: product.id,
        price: 10 + i,
        checked_at,
        shop_name: "stale name",
        enabled: 99,
      };
      await db
        .prepare("INSERT INTO quotes VALUES(?,?,?,?)")
        .bind(quote.id, quote.shop_id, quote.sku, JSON.stringify(quote))
        .run();
    }
    let preparations = 0;
    const env = {
      DB: new Proxy(db, {
        get(target, key) {
          if (key === "prepare")
            return (sql: string) => {
              preparations++;
              return target.prepare(sql);
            };
          const member = Reflect.get(target, key);
          return typeof member === "function" ? member.bind(target) : member;
        },
      }),
    } as unknown as Env;
    const context: PublicContext = {};
    const [first, second] = await Promise.all([
      publicData(env, context),
      publicData(env, context),
    ]);
    assert.strictEqual(first, second);
    assert.equal(preparations, 3);
    assert.deepEqual(
      first.products,
      (await productsSelectProducts(env).all<{ data: string }>()).results.map(
        (row) => JSON.parse(row.data),
      ),
    );
    assert.deepEqual(first.shops, await publicShops(env));
    assert.deepEqual(first.quotes, await quoteList(env, "", []));
    await db.prepare("UPDATE shops SET name='Updated' WHERE id='0'").run();
    const nextRequest = await publicData(env, {});
    assert.equal(
      nextRequest.quotes.find((q) => q.shop_id === "0")?.shop_name,
      "Updated",
    );
    assert.notEqual(
      first.quotes.find((q) => q.shop_id === "0")?.shop_name,
      "Updated",
    );
  } finally {
    await mf.dispose();
  }
});

import { instancePaths } from "./lib/instance.mjs";
const instance = instancePaths();
// Read-only application benchmark against an isolated D1 rebuilt from our snapshot.
// Run with: node scripts/cost-benchmark.mjs /absolute/path/results.json
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const root = fileURLToPath(new URL("../", import.meta.url));
const snapshot = JSON.parse(
  readFileSync(
    instance.snapshot,
    "utf8",
  ),
);
const bundled = await build({
  stdin: {
    resolveDir: root,
    sourcefile: "cost-benchmark-entry.ts",
    contents: `
    import app from './src/index.ts';
    export default { async fetch(request, env, ctx) {
      const metrics = {queries: 0, rows: 0};
      const record = (result) => {metrics.queries++; metrics.rows += result.meta?.rows_read || 0; return result;};
      const statement = (value) => new Proxy(value, {get(target, prop) {
        if (prop === 'bind') return (...args) => statement(target.bind(...args));
        if (prop === 'all' || prop === 'run') return async (...args) => record(await target[prop](...args));
        if (prop === 'first') return async (column) => {
          const result = record(await target.all());
          const row = result.results[0];
          return row ? (column ? row[column] : row) : null;
        };
        const member = target[prop];
        return typeof member === 'function' ? member.bind(target) : member;
      }});
      const DB = new Proxy(env.DB, {get(target, prop) {
        if (prop === 'prepare') return sql => statement(target.prepare(sql));
        const member = target[prop];
        return typeof member === 'function' ? member.bind(target) : member;
      }});
      const response = await app.fetch(request, {...env, DB}, ctx);
      const headers = new Headers(response.headers);
      headers.set('X-Benchmark-Queries', String(metrics.queries));
      headers.set('X-Benchmark-Rows', String(metrics.rows));
      return new Response(response.body, {status: response.status, headers});
    }};
  `,
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: bundled.outputFiles[0].text,
    compatibilityDate: "2026-10-13",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "isolated-cost-benchmark" },
    bindings: { PUBLIC_SITE: "true", EDGE_CACHE_SECONDS: "0" },
    serviceBindings: {
      ASSETS: async () =>
        new Response(
          '<html><head><title>AI比比</title></head><body><div id="root"></div></body></html>',
          { headers: { "Content-Type": "text/html" } },
        ),
    },
    outboundService: async () => {
      throw Error("Benchmark cannot send external requests");
    },
  }),
);
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(root + "migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(root + "migrations/" + file, "utf8")
      .replace(/^--.*$/gm, "")
      .replace(/\n/g, " ");
    await db.exec(sql);
  }
  await db.prepare("UPDATE settings SET freshness_hours=168 WHERE id=1").run();
  const statements = [];
  for (const p of snapshot.products)
    statements.push([
      "INSERT INTO products VALUES(?,?,?)",
      [p.id, p.category, JSON.stringify(p)],
    ]);
  for (const s of snapshot.shops)
    statements.push([
      "INSERT INTO shops(id,platform,name,url,data,enabled,status,checked_at,error) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        s.id,
        s.platform,
        s.name,
        s.url,
        JSON.stringify(s),
        s.enabled === false ? 0 : 1,
        s.collection_status,
        s.checked_at || null,
        s.error || null,
      ],
    ]);
  for (const q of snapshot.quotes) {
    statements.push([
      "INSERT INTO quotes VALUES(?,?,?,?)",
      [q.id, q.shop_id, q.sku, JSON.stringify(q)],
    ]);
    statements.push([
      "INSERT INTO observations VALUES(?,?,?,?,?)",
      [q.id, q.sku, q.checked_at, q.price, JSON.stringify(q)],
    ]);
  }
  for (let i = 0; i < statements.length; i += 25)
    await db.batch(
      statements
        .slice(i, i + 25)
        .map(([sql, values]) => db.prepare(sql).bind(...values)),
    );
  const paths = [
    "/",
    "/c/gpt",
    "/sku/plus-phi",
    "/shops",
    "/shops/S103573",
    "/official",
    "/sitemap.xml",
    "/api/products",
    "/api/shops",
    "/api/products/plus-phi",
    "/api/history/plus-phi",
  ];
  const results = [];
  for (const path of paths) {
    const response = await mf.dispatchFetch("https://benchmark.test" + path);
    await response.arrayBuffer();
    results.push({
      path,
      status: response.status,
      queries: Number(response.headers.get("X-Benchmark-Queries")),
      rows_read: Number(response.headers.get("X-Benchmark-Rows")),
    });
  }
  const result = {
    measured_at: new Date().toISOString(),
    source_at: snapshot.generated_at,
    cache: "disabled; cold D1 cost",
    dataset: {
      products: snapshot.products.length,
      shops: snapshot.shops.length,
      quotes: snapshot.quotes.length,
      observations: snapshot.quotes.length,
    },
    results,
  };
  if (process.argv[2])
    writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally {
  await mf.dispose();
}

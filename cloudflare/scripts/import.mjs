import { instancePaths } from "./lib/instance.mjs";
const instance = instancePaths();
import { seedShopStatement } from "./lib/seed-shop.ts";
import { MAX_SHOPS } from "../shared/site.ts";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
const snapshot = JSON.parse(readFileSync(instance.snapshot, "utf8"));
const config = JSON.parse(readFileSync(instance.seeds, "utf8"));
if (
  config.shops.length > Math.min(config.shop_limit || MAX_SHOPS, MAX_SHOPS)
)
  throw Error("Shop count exceeds configured limit");
if (snapshot.shops.length > MAX_SHOPS)
  throw Error(`Snapshot exceeds ${MAX_SHOPS} shops`);
const sql = (s) =>
  s === null || s === undefined
    ? "NULL"
    : "'" + String(s).replaceAll("'", "''") + "'";
const j = (v) => sql(JSON.stringify(v));
let lines = [];
for (const s of snapshot.shops) {
  const seed = config.shops.find((x) => x.id === s.id);
  lines.push(seedShopStatement(s, seed.source_token || s.id));
}
for (const p of config.products)
  lines.push(
    `INSERT OR IGNORE INTO products VALUES(${sql(p.id)},${sql(p.category)},${j(p)});`,
  );
for (const [id, m] of Object.entries(config.mappings))
  lines.push(
    `INSERT OR IGNORE INTO mappings VALUES(${sql(m.shop_id)},${sql(id.includes(":") ? id.slice(id.indexOf(":") + 1) : id)},${sql(m.sku)},${sql(m.accepted_fingerprint)},${j(m)});`,
  );
for (const q of snapshot.quotes) {
  lines.push(
    `INSERT OR IGNORE INTO quotes VALUES(${sql(q.id)},${sql(q.shop_id)},${sql(q.sku)},${j(q)});`,
  );
  if (q.collection_status === "ok")
    lines.push(
      `INSERT OR IGNORE INTO observations VALUES(${sql(q.id)},${sql(q.sku)},${sql(q.checked_at)},${Number(q.price)},${j(q)});`,
    );
}
for (const r of snapshot.review_items) {
  const id = r.shop_id + ":" + r.goods_id;
  lines.push(
    `INSERT OR IGNORE INTO goods(id,shop_id,source_id,title,data_at,reason) VALUES(${[id, r.shop_id, r.goods_id, r.name, snapshot.shops.find((s) => s.id === r.shop_id)?.checked_at || snapshot.generated_at, r.reason].map(sql)});`,
  );
}
// Import real locally observed history if present. Never fabricate earlier values.
if (existsSync(instance.database)) {
  const py =
    "import sqlite3,json,sys; c=sqlite3.connect(sys.argv[1]); print(json.dumps(c.execute('SELECT quote_id,checked_at,price FROM observations').fetchall()))";
  for (const [id, at, price] of JSON.parse(
    execFileSync("python3", ["-c", py, instance.database], { encoding: "utf8" }),
  )) {
    const q = snapshot.quotes.find((x) => x.id === id);
    if (q)
      lines.push(
        `INSERT OR IGNORE INTO observations VALUES(${sql(id)},${sql(q.sku)},${sql(at)},${price},${j({ ...q, price, checked_at: at })});`,
      );
  }
}
mkdirSync(instance.exports, { recursive: true });
writeFileSync(`${instance.exports}/import.sql`, lines.join("\n") + "\n");
console.log(
  `Generated seed SQL: ${snapshot.shops.length} shops; ${snapshot.quotes.length} retained quotes. Original observation times preserved.`,
);

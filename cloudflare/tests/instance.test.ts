import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { workerScript } from "./helpers/worker";
// @ts-expect-error Shared CLI modules are plain JavaScript.
import { loadSiteConfig } from "../scripts/lib/instance.mjs";
// @ts-expect-error Synthetic fixtures are plain JavaScript.
import { demoSql } from "../scripts/demo-data.mjs";

test("public site defaults disable analytics; local overrides contain only public fields", () => {
  const directory = mkdtempSync(join(tmpdir(), "aibibi-site-"));
  try {
    const path = join(directory, "site.json");
    writeFileSync(path, JSON.stringify({ name: "My comparison", url: "https://compare.example", secret: "do-not-bundle" }));
    const site = loadSiteConfig({ BIJIA_SITE_CONFIG: path });
    assert.equal(site.name, "My comparison");
    assert.equal(site.analyticsScript, "");
    assert.equal(site.analyticsId, "");
    assert.equal(site.secret, undefined);
    writeFileSync(path, JSON.stringify({ url: "https://compare.example/path" }));
    assert.throws(() => loadSiteConfig({ BIJIA_SITE_CONFIG: path }), /origin/);
    writeFileSync(path, JSON.stringify({ analyticsScript: "http://tracking.example/script.js" }));
    assert.throws(() => loadSiteConfig({ BIJIA_SITE_CONFIG: path }), /HTTPS/);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("demo fixtures show only current in-stock minimum; expired, absent and unknown stock do not compete", async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: await workerScript({ demo: true, name: "Demo instance" }),
    compatibilityDate: "2026-10-13", compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "instance-demo-test" }, bindings: { PUBLIC_SITE: "true" },
    serviceBindings: { ASSETS: async () => new Response('<html><head><title>default</title></head><body><div id="root"></div></body></html>',
      { headers: { "Content-Type": "text/html" } }) },
    outboundService: async () => { throw Error("No live store access in demo tests"); },
  }));
  try {
    const db = await mf.getD1Database("DB");
    for (const file of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort())
      await db.exec(readFileSync(`migrations/${file}`, "utf8").replace(/^--.*$/gm, "").replace(/\n/g, " "));
    await db.exec(demoSql().replace(/\n/g, " "));
    const response = await mf.dispatchFetch("https://demo.test/api/products");
    const data = await response.json() as { products: { id: string; min_price: number; ready_count: number }[] };
    assert.equal(data.products.length, 1);
    assert.equal(data.products[0].min_price, 99);
    assert.equal(data.products[0].ready_count, 1);
    const page = await (await mf.dispatchFetch("https://demo.test/")).text();
    assert.match(page, /Demo instance/);
    assert.match(page, /noindex, nofollow/);
    assert.equal(await (await mf.dispatchFetch("https://demo.test/robots.txt")).text(), "User-agent: *\nDisallow: /\n");
  } finally {
    await mf.dispose();
  }
});

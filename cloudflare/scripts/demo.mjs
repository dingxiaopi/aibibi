import { spawnSync, spawn } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fromRoot } from "./lib/instance.mjs";
import { demoSql } from "./demo-data.mjs";

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port = portIndex < 0 ? 8787 : Number(args[portIndex + 1]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Invalid demo port");
const prepareOnly = args.includes("--prepare-only");
const directory = fromRoot("cloudflare/.local");
mkdirSync(directory, { recursive: true });
const sitePath = fromRoot("cloudflare/.local/demo-site.json");
writeFileSync(sitePath, JSON.stringify({ ...JSON.parse(readFileSync(fromRoot("config/site.json"), "utf8")),
  url: `http://127.0.0.1:${port}`, demo: true, analyticsId: "", analyticsScript: "", redirectHosts: [] }));
const configPath = fromRoot("cloudflare/wrangler.demo.jsonc");
const generic = readFileSync(fromRoot("cloudflare/wrangler.jsonc"), "utf8");
writeFileSync(configPath, generic.replace('"name": "aibibi"', '"name": "aibibi-demo"')
  .replace('"database_name": "aibibi"', '"database_name": "aibibi-demo"')
  .replace("00000000-0000-0000-0000-000000000000", "11111111-1111-1111-1111-111111111111")
  .replace(/"required":\s*\["ADMIN_PASSWORD",\s*"COLLECTOR_INGEST_TOKEN"\]/, '"required": []'));
const sqlPath = fromRoot("cloudflare/.local/demo.sql");
writeFileSync(sqlPath, demoSql());
const env = { ...process.env, BIJIA_SITE_CONFIG: sitePath, BIJIA_WRANGLER_CONFIG: configPath,
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" };
const persist = fromRoot("cloudflare/.local/demo-d1");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: fromRoot("cloudflare"), env, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error("Demo setup failed");
}
try {
  run(process.execPath, ["scripts/wrangler.mjs", "d1", "migrations", "apply", "DB", "--local", "--persist-to", persist]);
  run(process.execPath, ["scripts/wrangler.mjs", "d1", "execute", "DB", "--local", "--persist-to", persist, "--file", sqlPath]);
  run("npm", ["run", "web:build"]);
  if (!prepareOnly) {
    console.log(`Demo: http://127.0.0.1:${port} (fictitious data, isolated database)`);
    const child = spawn(process.execPath, ["scripts/wrangler.mjs", "dev", "--local", "--port", String(port), "--persist-to", persist],
      { cwd: fromRoot("cloudflare"), env, stdio: "inherit" });
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
    await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code, signal) => code === 0 || signal ? resolve() : reject(Error("Demo server failed")));
    });
  }
} finally {
  // A later normal build/test must use the installation's own settings again.
  spawnSync(process.execPath, ["scripts/prepare-instance.mjs"], { cwd: fromRoot("cloudflare"), env: process.env, stdio: "inherit" });
}

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { relative } from "node:path";
import { fromRoot } from "./lib/instance.mjs";
import "./prepare-instance.mjs";

const args = process.argv.slice(2);
const configured = process.env.BIJIA_WRANGLER_CONFIG;
const config = configured ? fromRoot(configured) :
  fromRoot(existsSync(fromRoot("cloudflare/wrangler.local.jsonc"))
    ? "cloudflare/wrangler.local.jsonc" : "cloudflare/wrangler.jsonc");
if (!existsSync(config)) throw Error("Wrangler configuration does not exist");
const child = spawn(process.execPath, [fromRoot("cloudflare/node_modules/wrangler/bin/wrangler.js"), ...args, "--config", relative(fromRoot("cloudflare"), config)], {
  cwd: fromRoot("cloudflare"), stdio: "inherit", env: process.env,
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });

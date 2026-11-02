import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { instancePaths, fromRoot } from "./lib/instance.mjs";
import "./prepare-instance.mjs";
import "./import.mjs";

const result = spawnSync(process.execPath, [fromRoot("cloudflare/scripts/wrangler.mjs"),
  "d1", "execute", "DB", "--local", `--file=${resolve(instancePaths().exports, "import.sql")}`],
  { cwd: fromRoot("cloudflare"), env: process.env, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

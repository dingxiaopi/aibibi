import { instancePaths } from "./lib/instance.mjs";
const instance = instancePaths();
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { exportBundle } from "../shared/export-bundle.mjs";
const source = process.argv[2] || instance.snapshot;
const snapshot = JSON.parse(readFileSync(source, "utf8")),
  config = JSON.parse(readFileSync(instance.seeds, "utf8"));
if (snapshot.demo) throw Error("演示数据不能导出为正式采集包");
const statePath = `${instance.state}/sync-state.json`;
const state = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, "utf8"))
  : null;
const bundle = exportBundle(
  snapshot,
  config,
  state,
  process.env.BIJIA_URL?.replace(/\/$/, "") || "",
);
mkdirSync(instance.exports, { recursive: true });
writeFileSync(instance.bundle, JSON.stringify(bundle));
console.log(
  `Exported ${instance.bundle}; original capture times retained. Run npm run push:local to send it to BIJIA_URL.`,
);

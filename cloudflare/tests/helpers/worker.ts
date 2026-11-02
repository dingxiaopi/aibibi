import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

let bundledWorker: Promise<string> | undefined;
const testSite = {
  ...JSON.parse(readFileSync(new URL("../../../config/site.json", import.meta.url), "utf8")),
  url: "https://canonical.test", redirectHosts: ["alias.test", "worker.test"],
};

/** Test the current source without writing to the protected .generated/ tree. */
export function workerScript(site?: Record<string, unknown>) {
  if (!site && bundledWorker) return bundledWorker;
  const result = build({
    entryPoints: [
      fileURLToPath(new URL("../../src/index.ts", import.meta.url)),
    ],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    plugins: [{ name: "isolated-instance", setup(builder) {
      builder.onLoad({ filter: /[/\\]\.local[/\\]site\.json$/ }, () => ({
        contents: JSON.stringify({ ...testSite, ...site }), loader: "json",
      }));
    }}],
  }).then((result) => result.outputFiles[0].text);
  if (!site) bundledWorker = result;
  return result;
}

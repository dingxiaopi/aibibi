import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const fromRoot = (path) => {
  let ancestor = resolve(root, path);
  const missing = [];
  while (!existsSync(ancestor)) {
    missing.unshift(basename(ancestor));
    ancestor = dirname(ancestor);
  }
  return resolve(realpathSync(ancestor), ...missing);
};
export function instancePaths(env = process.env) {
  const path = fromRoot(env.BIJIA_INSTANCE_CONFIG || ".local/collector.json");
  if (env.BIJIA_INSTANCE_CONFIG && !existsSync(path)) throw Error("Explicit instance configuration does not exist");
  const config = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw Error("Instance configuration must be a JSON object");
  const data = fromRoot(env.BIJIA_DATA_DIR || config.data_dir || ".local/data");
  const choose = (variable, key, fallback) =>
    fromRoot(env[variable] || (!env.BIJIA_DATA_DIR && config[key]) || fallback);
  const runtime = choose("BIJIA_RUNTIME_DIR", "runtime_dir", resolve(data, "runtime"));
  const state = choose("BIJIA_STATE_DIR", "state_dir", resolve(data, "collection"));
  const exports = choose("BIJIA_EXPORT_DIR", "export_dir", resolve(data, "exports"));
  return {
    data, runtime, state, exports,
    seeds: resolve(data, "seeds.json"), snapshot: resolve(data, "snapshot.json"),
    database: resolve(runtime, "prices.sqlite3"),
    bundle: resolve(exports, "external-batch.json"),
    url: env.BIJIA_URL || config.url || "http://127.0.0.1:8787",
  };
}

export function loadSiteConfig(env = process.env) {
  const defaults = JSON.parse(readFileSync(fromRoot("config/site.json"), "utf8"));
  const path = fromRoot(env.BIJIA_SITE_CONFIG || ".local/site.json");
  if (env.BIJIA_SITE_CONFIG && !existsSync(path)) throw Error("Explicit site configuration does not exist");
  const local = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  if (!local || typeof local !== "object" || Array.isArray(local)) throw Error("Site configuration must be a JSON object");
  // Only public, known fields are bundled into the browser and Worker.
  const config = Object.fromEntries(Object.keys(defaults).map((key) => [key, local[key] ?? defaults[key]]));
  for (const key of ["name", "tagline", "description", "logo", "favicon"])
    if (typeof config[key] !== "string" || !config[key].trim()) throw Error(`Invalid site ${key}`);
  const origin = new URL(config.url);
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash)
    throw Error("Site url must be an HTTP(S) origin without credentials, path or query");
  config.url = origin.origin;
  if (!Array.isArray(config.redirectHosts) || config.redirectHosts.some((host) => typeof host !== "string" || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)))
    throw Error("Invalid redirectHosts");
  if (typeof config.demo !== "boolean") throw Error("Invalid demo flag");
  if (typeof config.analyticsScript !== "string" || typeof config.analyticsId !== "string") throw Error("Invalid analytics configuration");
  if (config.analyticsScript) {
    const url = new URL(config.analyticsScript);
    if (url.protocol !== "https:" || url.username || url.password) throw Error("Analytics must use HTTPS");
  }
  for (const key of ["logo", "favicon"])
    if (!config[key].startsWith("/") || config[key].startsWith("//")) throw Error(`${key} must be a local asset path`);
  return config;
}

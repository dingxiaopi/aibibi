import { instancePaths } from "./lib/instance.mjs";
const instance = instancePaths();
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";

const endpoint = process.env.BIJIA_URL?.replace(/\/$/, "");
const token = process.env.BIJIA_INGEST_TOKEN;
if (!endpoint || !token || token.length < 24)
  throw Error("需要 BIJIA_URL 和 BIJIA_INGEST_TOKEN");
const response = await fetch(endpoint + "/api/collector/state", {
  headers: { Authorization: "Bearer " + token },
  signal: AbortSignal.timeout(30000),
});
if (!response.ok) throw Error("同步后台排除记录失败：HTTP " + response.status);
const {
  rejected,
  disabled_shops = [],
  mapping_states = [],
} = await response.json();
if (!Array.isArray(rejected)) throw Error("无效排除列表");
// An authenticated mapping snapshot permits exact metadata comparisons; fingerprints
// alone cannot distinguish a reclassification of the same merchant description.
let products = [];
try {
  const catalog = await fetch(endpoint + "/api/products?sync=" + Date.now(), {
    signal: AbortSignal.timeout(30000),
  });
  if (!catalog.ok) throw Error("HTTP " + catalog.status);
  const data = await catalog.json();
  if (!Array.isArray(data.products)) throw Error("目录格式无效");
  products = data.products;
} catch {
  console.error("未取得线上规格目录；本次保留全部规格定义推送");
}
const path = instance.seeds;
const config = JSON.parse(readFileSync(path, "utf8"));
config.exclusions ||= {};
let count = 0;
for (const r of rejected) {
  // A sample profile owns only its selected stores; unrelated moderation stays on the server.
  if (!config.shops.some((s) => s.id === r.shop_id)) continue;
  if (
    !/^(G\d+|[WC][A-Za-z0-9_]+|N\d+(?:V\d+)?)$/.test(r.source_id) ||
    !Number.isFinite(Date.parse(r.data_at))
  )
    throw Error("排除记录身份或时间无效");
  const update = config.mapping_updates?.find(
    (u) => u.shop_id === r.shop_id && u.goods_id === r.source_id,
  );
  // An explicit newer local re-review can restore an excluded item.
  if (update && Date.parse(update.reviewed_at) > Date.parse(r.data_at))
    continue;
  const id = r.shop_id + ":" + r.source_id;
  config.exclusions[id] = r.data_at;
  const mappingKey = config.mappings[id] ? id : r.source_id;
  if (config.mappings[mappingKey]?.shop_id === r.shop_id)
    delete config.mappings[mappingKey];
  config.mapping_updates = (config.mapping_updates || []).filter(
    (u) => !(u.shop_id === r.shop_id && u.goods_id === r.source_id),
  );
  count++;
}
let paused = 0;
for (const shop of disabled_shops) {
  const seed = config.shops.find((s) => s.id === shop.id);
  if (!seed) continue;
  seed.enabled = false;
  if (shop.disabled_at && shop.closure_evidence) {
    seed.disabled_at = shop.disabled_at;
    seed.disabled_reason = shop.disabled_reason;
    seed.closure_evidence = shop.closure_evidence;
  }
  paused++;
}
config.mapping_acknowledgements ||= {};
let reconciled = 0;
for (const state of mapping_states) {
  if (
    !config.shops.some((s) => s.id === state.shop_id) ||
    !/^[a-f0-9]{64}$/.test(state.fingerprint)
  )
    continue;
  const id = state.shop_id + ":" + state.source_id;
  config.mapping_acknowledgements[id] = {
    fingerprint: state.fingerprint,
    reviewed_at: state.reviewed_at,
    destination: endpoint,
  };
  const update = config.mapping_updates?.find(
    (u) => u.shop_id === state.shop_id && u.goods_id === state.source_id,
  );
  // Only reconcile identical original content observed before this local review.
  if (
    update &&
    state.fingerprint === update.mapping.accepted_fingerprint &&
    (!state.reviewed_at ||
      Date.parse(state.reviewed_at) <= Date.parse(update.reviewed_at)) &&
    update.previous_fingerprint !== state.fingerprint
  ) {
    update.previous_fingerprint = state.fingerprint;
    reconciled++;
  }
}
writeFileSync(path + ".tmp", JSON.stringify(config, null, 2) + "\n");
renameSync(path + ".tmp", path);
mkdirSync(instance.state, { recursive: true });
writeFileSync(
  `${instance.state}/sync-state.json.tmp`,
  JSON.stringify({
    destination: endpoint,
    synced_at: new Date().toISOString(),
    products,
    mapping_states,
  }),
);
renameSync(
  `${instance.state}/sync-state.json.tmp`,
  `${instance.state}/sync-state.json`,
);
console.log(
  JSON.stringify({
    synced_exclusions: count,
    synced_disabled_shops: paused,
    reconciled_same_content: reconciled,
  }),
);

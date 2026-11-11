/**
 * Official prices change when the collector pushes a snapshot, not on deploy.
 * Each isolate checks the stored version at most once a minute and keeps the
 * parsed snapshot; the bundled file is used until the first push (or before
 * the table exists).
 */
import bundled from "../shared/official-prices.json";
import {
  official,
  setOfficial,
  validOfficial,
  type OfficialData,
} from "../shared/official-prices";
import { json, body } from "./auth";
import { hash, now } from "./domain";
import {
  officialBody,
  officialVersion,
  saveOfficial,
} from "./repo/official_snapshot";

const CHECK_MS = 60_000;
const MAX_BYTES = 2_000_000;
let current = "";
let checkedAt = 0;
let pending: Promise<void> | null = null;

const useBundled = () => {
  if (current) return;
  setOfficial(bundled as OfficialData);
  current = "bundled";
};

async function refresh(env: Env) {
  try {
    const version = await officialVersion(env).first<{ sha256: string }>();
    if (!version) {
      if (current !== "bundled") {
        current = "";
        useBundled();
      }
    } else if (version.sha256 !== current) {
      const row = await officialBody(env).first<{
        sha256: string;
        body: string;
      }>();
      const data: unknown = row ? JSON.parse(row.body) : null;
      if (row && validOfficial(data)) {
        setOfficial(data);
        current = row.sha256;
      } else useBundled();
    }
  } catch {
    useBundled();
  }
  checkedAt = Date.now();
}

export function loadOfficial(env: Env) {
  if (current && Date.now() - checkedAt < CHECK_MS) return Promise.resolve();
  return (pending ??= refresh(env).finally(() => {
    pending = null;
  }));
}

export async function publicOfficial(env: Env) {
  await loadOfficial(env);
  return json(official);
}

/** Collector push. Older snapshots are refused so a delayed run cannot roll prices back. */
export async function ingestOfficial(request: Request, env: Env) {
  const data = await body(request, MAX_BYTES);
  if (!validOfficial(data)) return json({ error: "官方价快照格式无效" }, 400);
  const text = JSON.stringify(data);
  const sha256 = await hash(text);
  const stored = await officialVersion(env).first<{
    collected_at: string;
    sha256: string;
  }>();
  if (stored?.sha256 === sha256)
    return json({ ok: true, changed: false, collected_at: data.collected_at, sha256 });
  if (stored && Date.parse(data.collected_at) < Date.parse(stored.collected_at))
    return json(
      { error: "快照早于线上版本", collected_at: stored.collected_at },
      409,
    );
  await saveOfficial(env).bind(data.collected_at, sha256, text, now()).run();
  checkedAt = 0;
  return json({ ok: true, changed: true, collected_at: data.collected_at, sha256 });
}

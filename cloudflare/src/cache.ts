/**
 * Public read cache. Data changes only when the local collector pushes, so
 * anonymous GETs are served from memory (per isolate, at most a minute, cleared
 * on any write in that isolate) and from the colo's edge cache for
 * EDGE_CACHE_SECONDS. Unset or 0 turns both off. The edge layer is a no-op on
 * workers.dev and takes effect on a custom domain.
 */
import { publicPage } from "./seo/pages";

const MEMORY_SECONDS = 60;
const MEMORY_ENTRIES = 300;
type Entry = {
  expires: number;
  status: number;
  headers: [string, string][];
  body: ArrayBuffer;
};
// Bytes, not Response objects: a body stream cannot be read from another request.
const memory = new Map<string, Entry>();

const PUBLIC_API = /^\/api\/(products|shops|history|official)(\/[A-Za-z0-9_-]+)?$/;
const TRACKING = /^(utm_.+|gclid|dclid|fbclid|msclkid|mc_cid|mc_eid|_ga)$/i;
const EXPIRES_HEADER = "X-Public-Cache-Expires";

const seconds = (env: Env) => Number(env.EDGE_CACHE_SECONDS) || 0;

export function cacheable(request: Request, env: Env, url: URL) {
  if (
    request.method !== "GET" ||
    env.PUBLIC_SITE !== "true" ||
    !seconds(env) ||
    request.headers.has("Cookie") ||
    request.headers.has("Authorization")
  )
    return false;
  if (url.pathname.startsWith("/api/")) return PUBLIC_API.test(url.pathname);
  return (
    publicPage(url.pathname) ||
    url.pathname === "/sitemap.xml" ||
    url.pathname === "/robots.txt"
  );
}

export function cacheKey(request: Request, env: Env) {
  const url = new URL(request.url);
  for (const name of [...url.searchParams.keys()])
    if (TRACKING.test(name)) url.searchParams.delete(name);
  // Keep functional and operator cache-busting parameters. Only tracking is discarded.
  url.searchParams.sort();
  url.searchParams.set(
    "__bijia_deployment",
    env.CF_VERSION_METADATA?.id || "local",
  );
  return url.href;
}

/** Any write may change public data; drop what this isolate remembers. */
export function invalidate(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") memory.clear();
}

export async function cached(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  produce: () => Promise<Response>,
) {
  const key = cacheKey(request, env);
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now())
    return tagged(
      new Response(hit.body, { status: hit.status, headers: hit.headers }),
      "memory",
    );
  const edgeSeconds = seconds(env);
  // The project types use the DOM lib, whose CacheStorage lacks Workers' `default`.
  const edge = (caches as unknown as { default: Cache }).default;
  const stored = await edge.match(key);
  if (stored && Number(stored.headers.get(EXPIRES_HEADER)) > Date.now()) {
    await remember(key, stored, Number(stored.headers.get(EXPIRES_HEADER)));
    return tagged(stored, "edge");
  }
  const response = await produce();
  if (
    response.status !== 200 ||
    response.headers.has("Set-Cookie") ||
    /\bprivate\b/i.test(response.headers.get("Cache-Control") || "")
  )
    return response;
  const expires = Date.now() + edgeSeconds * 1000;
  // The stored copy carries its own lifetime; the client still gets the original header.
  const copy = new Response(response.clone().body, response);
  copy.headers.set(
    "X-Client-Cache-Control",
    response.headers.get("Cache-Control") || "",
  );
  copy.headers.set("Cache-Control", `public, max-age=${edgeSeconds}`);
  copy.headers.set(EXPIRES_HEADER, String(expires));
  await remember(key, copy, expires);
  ctx.waitUntil(edge.put(key, copy));
  return tagged(response, "miss");
}

async function remember(key: string, response: Response, expires: number) {
  if (memory.size >= MEMORY_ENTRIES) memory.delete(memory.keys().next().value!);
  memory.set(key, {
    expires: Math.min(Date.now() + MEMORY_SECONDS * 1000, expires),
    status: response.status,
    headers: [...response.headers],
    body: await response.clone().arrayBuffer(),
  });
}

function tagged(response: Response, source: string) {
  const copy = new Response(response.clone().body, response);
  copy.headers.delete(EXPIRES_HEADER);
  const client = copy.headers.get("X-Client-Cache-Control");
  if (client !== null) {
    copy.headers.delete("X-Client-Cache-Control");
    if (client) copy.headers.set("Cache-Control", client);
    else copy.headers.delete("Cache-Control");
  }
  copy.headers.set("X-Cache", source);
  return copy;
}

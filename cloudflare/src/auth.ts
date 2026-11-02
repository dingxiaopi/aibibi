import {
  loggedInSelectSessions,
  loginDeleteSessions,
  loginInsertSessions,
} from "./repo/sessions";
import {
  loginDeleteLoginLimits,
  loginSelectLoginLimits,
  loginInsertLoginLimits,
  loginDeleteLoginLimits2,
} from "./repo/login_limits";
import { auditInsertAudit } from "./repo/audit";
import { hash, now } from "./domain";
export const json = (value: unknown, status = 200, extra: HeadersInit = {}) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
/** A client-side request problem; the entry point answers with its status instead of 500. */
export class RequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function body(request: Request, maxBytes = 8192) {
  if (Number(request.headers.get("content-length") || 0) > maxBytes)
    throw new RequestError("请求过大", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("缺少请求正文", 400);
  let size = 0;
  const parts: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new RequestError("请求过大", 413);
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let n = 0;
  for (const part of parts) {
    bytes.set(part, n);
    n += part.length;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new RequestError("请求正文不是有效的JSON", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new RequestError("请求正文必须是JSON对象", 400);
  return parsed as Record<string, unknown>;
}
export function sameOrigin(request: Request) {
  return request.headers.get("Origin") === new URL(request.url).origin;
}
/** Authenticate the trusted local collector without creating a browser session. */
export async function collectorAuthorized(request: Request, env: Env) {
  const configured = env.COLLECTOR_INGEST_TOKEN;
  if (!configured || configured.length < 24) return false;
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || token.length > 512) return false;
  const a = new TextEncoder().encode(await hash(token));
  const b = new TextEncoder().encode(await hash(configured));
  return a.length === b.length && (crypto.subtle as any).timingSafeEqual(a, b);
}
export async function loggedIn(request: Request, env: Env) {
  const token = request.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)bijia_session=([A-Za-z0-9-]+)/)?.[1];
  if (!token) return false;
  return Boolean(
    await loggedInSelectSessions(env)
      .bind(await hash(token), now())
      .first(),
  );
}
export async function login(request: Request, env: Env) {
  if (!sameOrigin(request)) return json({ error: "来源校验失败" }, 403);
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12)
    return json({ error: "请先配置管理员密码" }, 503);
  const key = await hash("login:" + request.headers.get("CF-Connecting-IP"));
  const at = now();
  await loginDeleteLoginLimits(env).bind(at).run();
  const limit = await loginSelectLoginLimits(env)
    .bind(key)
    .first<{ attempts: number }>();
  if (limit && limit.attempts >= 5)
    return json({ error: "尝试次数过多，请15分钟后再试" }, 429);
  const input = await body(request);
  const a = new TextEncoder().encode(await hash(String(input.password || ""))),
    b = new TextEncoder().encode(await hash(env.ADMIN_PASSWORD));
  if (!(crypto.subtle as any).timingSafeEqual(a, b)) {
    await loginInsertLoginLimits(env)
      .bind(key, new Date(Date.now() + 900000).toISOString())
      .run();
    return json({ error: "密码不正确" }, 401);
  }
  const token = crypto.randomUUID();
  await env.DB.batch([
    loginDeleteSessions(env).bind(at),
    loginInsertSessions(env).bind(
      await hash(token),
      new Date(Date.now() + 28800000).toISOString(),
    ),
    loginDeleteLoginLimits2(env).bind(key),
  ]);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return json({ ok: true }, 200, {
    "Set-Cookie": `bijia_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`,
  });
}
export async function audit(env: Env, action: string, target: string) {
  await auditInsertAudit(env)
    .bind(crypto.randomUUID(), now(), action, target)
    .run();
}

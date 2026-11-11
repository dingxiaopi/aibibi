import { json, login } from "./auth";
import { settings } from "./repo/settings";
import { adminRoutes } from "./routes/admin";
import { publicRoutes } from "./routes/public";
import { collectorRoutes } from "./routes/collector";
import type { PublicContext } from "./services/public-data";
type Handler = (
  request: Request,
  env: Env,
  url: URL,
  context?: PublicContext,
) => Promise<Response>;
type Route = { method: string; pattern: RegExp; handler: Handler };
async function applicationApi(
  request: Request,
  env: Env,
  url: URL,
  context: PublicContext = {},
) {
  const config = await (context.settings ??= settings(env));
  if (!config) return json({ error: "数据库未初始化" }, 503);
  if (url.pathname === "/api/admin/login" && request.method === "POST")
    return login(request, env);
  return url.pathname.startsWith("/api/admin/")
    ? adminRoutes(request, env, url, config)
    : publicRoutes(request, env, url, config, context);
}
const routes: Route[] = [
  {
    method: "GET",
    pattern: /^\/api\/collector\/state$/,
    handler: collectorRoutes,
  },
  {
    method: "*",
    pattern: /^\/api\/collector\/transfers$/,
    handler: collectorRoutes,
  },
  {
    method: "*",
    pattern: /^\/api\/collector\/official$/,
    handler: collectorRoutes,
  },
  { method: "POST", pattern: /^\/api\/ingest$/, handler: collectorRoutes },
  { method: "*", pattern: /^\/api\//, handler: applicationApi },
];
export async function routeApi(
  request: Request,
  env: Env,
  url = new URL(request.url),
  context: PublicContext = {},
) {
  const route = routes.find(
    (r) =>
      (r.method === "*" || r.method === request.method) &&
      r.pattern.test(url.pathname),
  );
  return route
    ? route.handler(request, env, url, context)
    : json({ error: "接口不存在" }, 404);
}

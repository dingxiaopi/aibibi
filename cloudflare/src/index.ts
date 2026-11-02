import { publicPage, renderPage } from "./seo/pages";
import { discovery } from "./seo/discovery";
import { json, RequestError } from "./auth";
import { routeApi } from "./router";
import { cacheable, cached, invalidate } from "./cache";
import { SITE_URL, SITE_REDIRECT_HOSTS } from "../shared/site";

async function handle(request: Request, env: Env, url: URL) {
  if (url.pathname.startsWith("/data/"))
    return json({ error: "完整快照不公开，请使用页面查询" }, 404);
  if (url.pathname.startsWith("/api/")) return routeApi(request, env, url);
  if (["GET", "HEAD"].includes(request.method)) {
    if (url.pathname === "/favorites") {
      const asset = await env.ASSETS.fetch(
        new Request(new URL("/index.html", url)),
      );
      const headers = new Headers(asset.headers);
      headers.set("Cache-Control", "private, no-store");
      headers.set("X-Robots-Tag", "noindex, nofollow");
      return new Response(request.method === "HEAD" ? null : asset.body, {
        status: asset.status,
        headers,
      });
    }
    if (url.pathname === "/sitemap.xml" || url.pathname === "/robots.txt")
      return discovery(request, env);
    if (publicPage(url.pathname)) return renderPage(request, env);
    if (url.pathname.startsWith("/shop/"))
      return Response.redirect(
        new URL(url.pathname.replace("/shop/", "/shops/") + url.search, url),
        308,
      );
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      if (
        ["GET", "HEAD"].includes(request.method) &&
        SITE_REDIRECT_HOSTS.includes(url.host) && url.origin !== SITE_URL &&
        !url.pathname.startsWith("/api/") &&
        !url.pathname.startsWith("/data/")
      )
        return Response.redirect(
          `${SITE_URL}${url.pathname}${url.search}`,
          301,
        );
      invalidate(request);
      if (cacheable(request, env, url))
        return await cached(request, env, ctx, () => handle(request, env, url));
      const response = await handle(request, env, url);
      if (
        request.headers.has("Cookie") ||
        request.headers.has("Authorization")
      ) {
        const headers = new Headers(response.headers);
        headers.set("Cache-Control", "private, no-store");
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      }
      return response;
    } catch (error) {
      if (error instanceof RequestError)
        return json({ error: error.message }, error.status);
      console.log(
        JSON.stringify({
          event: "request_error",
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
      return json({ error: "请求处理失败，请查看后台日志或稍后重试" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

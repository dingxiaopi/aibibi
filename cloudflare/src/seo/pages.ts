import { routeApi } from "../router";
import { pageMeta, productSchema } from "../../shared/page-meta";
import { SITE_NAME } from "../../shared/site";
import type {
  ProductsResponse,
  ShopsResponse,
  ProductDetailResponse,
  ShopDetailResponse,
} from "../../shared/api-types";
import { escapeHtml, pageContent, safeJson } from "./content";
import { official, officialMeta } from "../../shared/official-prices";
import { loadOfficial } from "../official-data";
import type { PublicContext } from "../services/public-data";
export const publicPage = (path: string) =>
  path === "/" ||
  /^\/(c|sku|shops|official)\/[^/]+$/.test(path) ||
  path === "/shops" ||
  path === "/official";
/** Client-rendered pages without server content; keep in sync with web/App.tsx. */
export const appPage = (path: string) =>
  ["/search", "/about", "/submit", "/sponsors", "/admin"].includes(path) ||
  /^\/admin\/(sponsors|reviews)$/.test(path);
export async function readPublic<T>(
  path: string,
  request: Request,
  env: Env,
  context: PublicContext = {},
): Promise<T | null> {
  const url = new URL(path, request.url);
  const response = await routeApi(
    new Request(url, { headers: request.headers }),
    env,
    url,
    context,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw Error(`Public page read failed: ${response.status}`);
  return response.json<T>();
}
export async function renderPage(request: Request, env: Env) {
  const url = new URL(request.url),
    path = url.pathname;
  const asset = await env.ASSETS.fetch(
    new Request(new URL("/index.html", url), { method: "GET" }),
  );
  const headers = new Headers(asset.headers);
  headers.delete("content-length");
  headers.delete("etag");
  headers.set("Content-Type", "text/html; charset=utf-8");
  if (env.PUBLIC_SITE !== "true") {
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    const privateHtml = new HTMLRewriter()
      .on("head", {
        element(el) {
          el.append(
            '<meta name="robots" content="noindex, nofollow" data-private="true">',
            { html: true },
          );
        },
      })
      .transform(asset);
    return new Response(request.method === "HEAD" ? null : privateHtml.body, {
      headers,
    });
  }
  const context: PublicContext = {};
  const [catalog, directory] = await Promise.all([
    readPublic<ProductsResponse>("/api/products", request, env, context),
    readPublic<ShopsResponse>("/api/shops", request, env, context),
    loadOfficial(env),
  ]);
  if (!catalog || !directory) throw Error("Missing public catalog");
  const initial: Record<string, unknown> = {
    "/api/products": catalog,
    "/api/shops": directory,
  };
  if (path === "/official" || path.startsWith("/official/"))
    initial["/api/official"] = official;
  let missing = false,
    quotes: ShopDetailResponse["quotes"] = [];
  if (path.startsWith("/sku/")) {
    const key = `/api/products/${encodeURIComponent(path.slice(5))}`;
    const detail = await readPublic<ProductDetailResponse>(
      key,
      request,
      env,
      context,
    );
    if (detail) initial[key] = detail;
    else missing = true;
  } else if (path.startsWith("/shops/")) {
    const key = `/api/shops/${encodeURIComponent(path.slice(7))}`;
    const detail = await readPublic<ShopDetailResponse>(
      key,
      request,
      env,
      context,
    );
    if (detail) {
      initial[key] = detail;
      quotes = detail.recorded_quotes ?? detail.quotes;
    } else missing = true;
  } else if (path.startsWith("/c/"))
    missing = !catalog.products.some((p) => p.category === path.slice(3));
  const special = officialMeta(path);
  if (path.startsWith("/official/") && !special) missing = true;
  const meta = pageMeta(
    path,
    url.origin,
    catalog,
    directory.shops,
    missing,
    special,
  );
  const product = catalog.products.find((p) => path === `/sku/${p.id}`);
  const tags = `<meta name="description" content="${escapeHtml(meta.description)}"><link rel="canonical" href="${escapeHtml(meta.canonical)}"><meta property="og:title" content="${escapeHtml(meta.title)}"><meta property="og:description" content="${escapeHtml(meta.description)}"><meta property="og:url" content="${escapeHtml(meta.canonical)}"><meta property="og:type" content="${product ? "product" : "website"}"><meta property="og:site_name" content="${escapeHtml(SITE_NAME)}"><meta name="robots" content="${meta.noindex ? "noindex, nofollow" : "index, follow"}">`;
  const schema =
    product && !missing
      ? `<script type="application/ld+json" id="product-schema">${safeJson(productSchema(product, meta.canonical))}</script>`
      : "";
  const html = new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(meta.title);
      },
    })
    .on(
      'meta[name="description"],meta[name="robots"],meta[property^="og:"],link[rel="canonical"]',
      {
        element(el) {
          el.remove();
        },
      },
    )
    .on("head", {
      element(el) {
        el.append(tags + schema, { html: true });
      },
    })
    .on("#root", {
      element(el) {
        // Keep the boot shell from index.html; the text is for crawlers.
        el.append(
          `<div class="ssr-fallback">${pageContent(path, catalog, directory.shops, quotes, missing)}</div>`,
          { html: true },
        );
      },
    })
    .on("body", {
      element(el) {
        el.append(
          `<script type="application/json" id="initial-data">${safeJson(initial)}</script>`,
          { html: true },
        );
      },
    })
    .transform(asset);
  headers.set("Cache-Control", "public, max-age=300");
  if (missing) headers.set("X-Robots-Tag", "noindex");
  return new Response(request.method === "HEAD" ? null : html.body, {
    status: missing ? 404 : 200,
    headers,
  });
}

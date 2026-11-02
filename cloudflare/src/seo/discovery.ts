import { shopIndexable } from "../../shared/shop-visibility";
import { siteOrigin, DEMO_MODE } from "../../shared/site";
import { official } from "../../shared/official-prices";
import type { ProductsResponse, ShopsResponse } from "../../shared/api-types";
import { readPublic } from "./pages";
import { escapeHtml, latestDate } from "./content";
import type { PublicContext } from "../services/public-data";
export async function discovery(request: Request, env: Env) {
  if (env.PUBLIC_SITE !== "true" || DEMO_MODE)
    return new Response("User-agent: *\nDisallow: /\n", {
      status: new URL(request.url).pathname === "/robots.txt" ? 200 : 404,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  const origin = siteOrigin(new URL(request.url).origin);
  if (new URL(request.url).pathname === "/robots.txt")
    return new Response(
      request.method === "HEAD"
        ? null
        : `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`,
      {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      },
    );
  const context: PublicContext = {};
  const [catalog, directory] = await Promise.all([
    readPublic<ProductsResponse>("/api/products", request, env, context),
    readPublic<ShopsResponse>("/api/shops", request, env, context),
  ]);
  if (!catalog || !directory) throw Error("Missing sitemap catalog");
  const checks = (await context.catalog!).quotes;
  const lastCheck = new Map<string, string | undefined>();
  for (const row of checks)
    lastCheck.set(
      row.sku,
      latestDate([lastCheck.get(row.sku), row.checked_at]),
    );
  const entries = new Map<string, string | undefined>();
  const recent = latestDate([
    ...lastCheck.values(),
    ...directory.shops.filter((s) => s.listed).map((s) => s.checked_at),
  ]);
  entries.set("/", recent);
  entries.set("/shops", recent);
  for (const p of catalog.products) {
    entries.set(`/sku/${encodeURIComponent(p.id)}`, lastCheck.get(p.id));
    const category = `/c/${encodeURIComponent(p.category)}`;
    entries.set(
      category,
      latestDate([entries.get(category), lastCheck.get(p.id)]),
    );
  }
  entries.set("/official", official.collected_at);
  for (const app of official.apps)
    entries.set(`/official/${app.id}`, official.collected_at);
  for (const s of directory.shops.filter(shopIndexable))
    entries.set(
      `/shops/${encodeURIComponent(s.id)}`,
      s.checked_at || undefined,
    );
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...entries].map(([path, date]) => `<url><loc>${escapeHtml(origin + path)}</loc>${date && Number.isFinite(Date.parse(date)) ? `<lastmod>${escapeHtml(new Date(date).toISOString())}</lastmod>` : ""}</url>`).join("")}</urlset>`;
  return new Response(request.method === "HEAD" ? null : xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

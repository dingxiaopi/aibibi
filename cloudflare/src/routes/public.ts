import {
  publicRoutesSelectRateLimits,
  publicRoutesDeleteRateLimits,
  publicRoutesInsertRateLimits,
} from "../repo/rate_limits";
import {
  publicRoutesSelectLeads,
  publicRoutesInsertLeads,
} from "../repo/leads";
import { publicRoutesSelectProducts } from "../repo/products";
import { publicRoutesSelectObservations } from "../repo/observations";
import {
  publicData,
  publicShop,
  type PublicContext,
} from "../services/public-data";
import { adminRoutesSelectShops } from "../repo/shops";
import type { Shop as StoredShop } from "../domain";
import { plain, text, now, available, fresh } from "../domain";
import { json, body, sameOrigin, loggedIn } from "../auth";
import { activeQuotes } from "../catalog";
import { quoteList, products, withVisibility } from "../services/catalog";
import type { Settings } from "../repo/settings";
import type {
  Quote,
  Product,
  ProductDetailResponse,
  ShopsResponse,
  ShopDetailResponse,
  Observation,
  HistoryResponse,
} from "../../shared/api-types";
export async function publicRoutes(
  request: Request,
  env: Env,
  url: URL,
  config: Settings,
  context: PublicContext = {},
) {
  const path = url.pathname;

  if (path === "/api/leads" && request.method === "POST") {
    if (text(env.PUBLIC_SITE) !== "true" && !(await loggedIn(request, env)))
      return json({ error: "私有预览需要登录" }, 401);
    if (!sameOrigin(request)) return json({ error: "来源校验失败" }, 403);
    const b = await body(request);
    const name = plain(b.name).slice(0, 80),
      note = plain(b.note).slice(0, 1000);
    let target: URL;
    try {
      target = new URL(text(b.url));
    } catch {
      return json({ error: "网址格式不正确" }, 400);
    }
    if (
      !name ||
      target.protocol !== "https:" ||
      target.username ||
      target.password ||
      target.href.length > 500
    )
      return json({ error: "请填写名称和有效HTTPS网址" }, 400);
    const { hash } = await import("../domain");
    const key = await hash("lead:" + request.headers.get("CF-Connecting-IP"));
    await publicRoutesDeleteRateLimits(env).bind(now()).run();
    const limit = await publicRoutesSelectRateLimits(env)
      .bind(key, now())
      .first<{ attempts: number }>();
    if (limit && limit.attempts >= 5)
      return json({ error: "今天提交次数已用完" }, 429);
    if (
      (await publicRoutesSelectLeads(env).first<{
        n: number;
      }>())!.n >= 1000
    )
      return json({ error: "线索暂时已满，请稍后提交" }, 429);
    target.search = "";
    target.hash = "";
    await publicRoutesInsertRateLimits(env)
      .bind(key, new Date(Date.now() + 86400000).toISOString(), now(), now())
      .run();
    await publicRoutesInsertLeads(env)
      .bind(crypto.randomUUID(), name, target.href, note, now())
      .run();
    return json({ ok: true }, 201);
  }
  if (text(env.PUBLIC_SITE) !== "true" && !(await loggedIn(request, env)))
    return json({ error: "当前为私有预览，请先登录管理后台" }, 401);
  if (path === "/api/quote-reports" && request.method === "POST") {
    const { submitQuoteReport } = await import("../quote-reports");
    return submitQuoteReport(request, env);
  }
  if (path === "/api/sponsors" || path.startsWith("/api/sponsors/")) {
    const { publicSponsors } = await import("../sponsors");
    return publicSponsors(request, env, url);
  }
  if (request.method !== "GET") return json({ error: "方法不支持" }, 405);
  if (path === "/api/official") {
    const { publicOfficial } = await import("../official-data");
    return publicOfficial(env);
  }
  if (path === "/api/products")
    return json(await products(env, url, config.freshness_hours, context));
  if (path === "/api/shops") {
    const { shops, quotes, products: catalog } = await publicData(env, context);
    const categories = new Map(catalog.map((p) => [p.id, p.category]));
    return json({
      shops: withVisibility(
        shops,
        activeQuotes(quotes, config.freshness_hours),
        categories,
      ),
    } satisfies ShopsResponse);
  }
  const match = path.match(/^\/api\/products\/([A-Za-z0-9-]+)$/);
  if (match) {
    const data = context.catalog ? await context.catalog : null;
    const row = data
      ? null
      : await publicRoutesSelectProducts(env)
          .bind(match[1])
          .first<{ data: string }>();
    const p = data
      ? data.products.find((p) => p.id === match[1])
      : row
        ? (JSON.parse(row.data) as Product)
        : null;
    if (!p) return json({ error: "商品不存在" }, 404);
    let quotes = activeQuotes(
      data
        ? data.quotes.filter((q) => q.sku === match[1])
        : await quoteList(env, "WHERE q.sku=?", [match[1]]),
      config.freshness_hours,
    ) as Quote[];
    const platform = url.searchParams.get("platform");
    if (platform && platform !== "all")
      quotes = quotes.filter((q) => q.platform === platform);
    const order = url.searchParams.get("sort");
    if (url.searchParams.get("ready") === "1")
      quotes = quotes.filter(
        (q) => available(q, config.freshness_hours) && q.enabled,
      );
    quotes.sort((a, b) =>
      order === "high"
        ? Number(b.price) - Number(a.price)
        : order === "low"
          ? Number(a.price) - Number(b.price)
          : Number(available(b, config.freshness_hours)) -
              Number(available(a, config.freshness_hours)) ||
            Number(a.price) - Number(b.price),
    );
    return json({
      product: p,
      quotes,
      hours: config.freshness_hours,
    } satisfies ProductDetailResponse);
  }
  const history = path.match(/^\/api\/history\/([A-Za-z0-9-]+)$/);
  if (history) {
    const r = await publicRoutesSelectObservations(env)
      .bind(history[1])
      .all<Observation>();
    return json({ observations: r.results } satisfies HistoryResponse);
  }
  const sm = path.match(/^\/api\/shops\/([A-Za-z0-9_-]+)$/);
  if (sm) {
    const data = context.catalog ? await context.catalog : null;
    const row = data
      ? null
      : await adminRoutesSelectShops(env).bind(sm[1]).first<StoredShop>();
    const s = data
      ? data.shops.find((s) => s.id === sm[1])
      : row
        ? publicShop(row)
        : null;
    if (!s) return json({ error: "店铺不存在" }, 404);
    const storedQuotes = data
      ? data.quotes.filter((q) => q.shop_id === sm[1])
      : await quoteList(env, "WHERE q.shop_id=?", [sm[1]]);
    const quotes = activeQuotes(storedQuotes, config.freshness_hours) as Quote[];
    const recordedQuotes = storedQuotes.filter(
      (q) => fresh(q, config.freshness_hours) &&
        typeof q.price === "number" && Number.isFinite(q.price) && q.price > 0,
    ) as Quote[];
    return json({
      shop: withVisibility([s], quotes)[0],
      quotes,
      recorded_quotes: recordedQuotes,
      hours: config.freshness_hours,
    } satisfies ShopDetailResponse);
  }
  return json({ error: "接口不存在" }, 404);
}

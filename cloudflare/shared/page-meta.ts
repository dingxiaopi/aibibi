import { hasActivePrice } from "./quote-eligibility";
import { shopIndexable } from "./shop-visibility";
import type { ProductsResponse, Shop, CatalogProduct } from "./api-types";
import {
  DEMO_MODE,
  CATEGORY_NAMES,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  siteOrigin,
} from "./site";
export function pageMeta(
  path: string,
  origin: string,
  catalog?: ProductsResponse,
  shops: Shop[] = [],
  missing = false,
  /** Title and description from a lazily loaded page module (e.g. official prices). */
  special?: { title: string; description: string } | null,
) {
  const url = new URL(path, origin);
  const product = catalog?.products.find(
    (p) => url.pathname === `/sku/${p.id}`,
  );
  const shop = shops.find((s) => url.pathname === `/shops/${s.id}`);
  const category = CATEGORY_NAMES[url.pathname.slice(3)];
  let title = `${SITE_NAME} · ${SITE_TAGLINE}`,
    description = SITE_DESCRIPTION;
  if (product) {
    title = `${product.name} ${product.spec} 价格对比 · ${SITE_NAME}`;
    description = `比较 ${product.name} ${product.spec} 的同规格报价、库存与购买条件，查看店铺来源和采集时间。`;
  } else if (shop) {
    title = `${shop.name} 店铺报价 · ${SITE_NAME}`;
    description = `查看 ${shop.name} 的 AI 订阅报价、库存及最近检查时间。`;
  } else if (url.pathname.startsWith("/c/") && category) {
    title = `${category} 订阅价格对比 · ${SITE_NAME}`;
    description = `比较 ${category} 不同订阅规格的有效报价、库存与购买条件。`;
  } else if (special) {
    ({ title, description } = special);
  } else if (url.pathname === "/shops") {
    title = `店铺目录 · ${SITE_NAME}`;
    description = `查看 ${SITE_NAME} 收录的店铺、采集状态与报价来源。`;
  } else {
    const label = url.pathname.startsWith("/admin")
      ? "管理后台"
      : (
          {
            "/about": "数据说明",
            "/submit": "提交店铺",
            "/search": "搜索结果",
            "/sponsors": "合作说明",
            "/favorites": "我的收藏",
          } as Record<string, string>
        )[url.pathname];
    if (label) title = `${label} · ${SITE_NAME}`;
  }
  if (missing) {
    title = `页面不存在 · ${SITE_NAME}`;
    description = "该页面不存在，请返回首页查找商品或店铺。";
  }
  const canonical = siteOrigin(origin) + url.pathname;
  return {
    title,
    description,
    canonical,
    noindex:
      DEMO_MODE ||
      missing ||
      url.pathname.startsWith("/admin") ||
      url.pathname === "/search" ||
      url.pathname === "/favorites" ||
      Boolean(shop && !shopIndexable(shop)),
  };
}

export function productSchema(product: CatalogProduct, canonical: string) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${product.name} ${product.spec}`,
    description: product.channel,
    sku: product.id,
    url: canonical,
  };
  if (hasActivePrice(product))
    schema.offers = {
      "@type": "AggregateOffer",
      priceCurrency: "CNY",
      lowPrice: product.min_price,
      offerCount: product.ready_count,
      url: canonical,
    };
  return schema;
}

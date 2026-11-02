import type {
  CatalogProduct,
  ProductsResponse,
  Shop,
  Quote,
} from "../../shared/api-types";
import { SITE_NAME, CATEGORY_NAMES } from "../../shared/site";
import { hasActivePrice } from "../../shared/quote-eligibility";
import { officialContent } from "./official";
import { cny, officialFor, regionName } from "../../shared/official-prices";
export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const safeJson = (value: unknown) =>
  JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
export function latestDate(values: (string | null | undefined)[]) {
  return values
    .filter((v): v is string => !!v && Number.isFinite(Date.parse(v)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}
const price = (p: CatalogProduct) =>
  hasActivePrice(p) ? `当前最低价：¥${p.min_price}` : "暂无有效报价";
const productRow = (p: CatalogProduct) =>
  `<li><a href="/sku/${encodeURIComponent(p.id)}">${escapeHtml(p.name)} · ${escapeHtml(p.spec)}</a> — ${price(p)}；有效报价店铺 ${p.ready_shop_count} 家</li>`;
function officialLine(sku: string) {
  const ref = officialFor(sku);
  if (!ref) return "";
  const unit = ref.plan.period === "year" ? "年" : "月";
  return `<p>${escapeHtml(ref.plan.label)} App Store 官方价：${ref.us ? `美区 ${cny(ref.us.cny)}/${unit}，` : ""}最低为${escapeHtml(regionName(ref.cheapest.region))}区 ${cny(ref.cheapest.cny)}/${unit}。<a href="/official/${ref.app.id}">查看各地区官方价格</a></p>`;
}
export function pageContent(
  path: string,
  catalog: ProductsResponse,
  shops: Shop[],
  detailQuotes: Quote[] = [],
  missing = false,
) {
  if (missing)
    return `<main><h1>页面不存在</h1><a href="/">返回 ${SITE_NAME} 首页</a></main>`;
  let content = "";
  const product = catalog.products.find((p) => path === `/sku/${p.id}`);
  const shop = shops.find((s) => path === `/shops/${s.id}`);
  if (path === "/official" || path.startsWith("/official/")) {
    content = officialContent(path);
  } else if (product) {
    const checked = latestDate(
      product.min_price_shops
        .map((s) => s.checked_at)
        .concat(product.last_observed_at || ""),
    );
    content = `<h1>${escapeHtml(product.name)} · ${escapeHtml(product.spec)}</h1><p>${escapeHtml(product.channel)}</p><p>${price(product)}</p><p>有效报价店铺 ${product.ready_shop_count} 家</p>${officialLine(product.id)}<p>最近观察时间：${escapeHtml(checked || "暂无记录")}</p><p><a href="/c/${encodeURIComponent(product.category)}">查看同类商品</a></p>`;
  } else if (shop) {
    content = `<h1>${escapeHtml(shop.name)}</h1><p>平台：${escapeHtml(shop.platform)}</p><p>最近检查：${escapeHtml(shop.checked_at || "暂无记录")}</p><p>已审核商品记录；库存未知、售罄或兑换受限的商品不参与当前最低价。</p><ul>${detailQuotes.map((q) => `<li><a href="/sku/${encodeURIComponent(q.sku)}">${escapeHtml(q.item_name)}</a>：¥${q.price}；${!q.enabled ? "店铺已暂停" : q.stock_status === "unknown" ? "库存未知" : q.stock_status === "out" ? "采集时售罄" : q.availability !== "ready" ? "兑换条件待确认" : "采集时有货"}</li>`).join("")}</ul>`;
  } else if (path === "/shops") {
    content = `<h1>店铺目录</h1><ul>${shops
      .filter((s) => s.listed)
      .map(
        (s) =>
          `<li><a href="/shops/${encodeURIComponent(s.id)}">${escapeHtml(s.name)}</a> · ${escapeHtml(s.collection_status)} · ${escapeHtml(s.checked_at || "暂无检查记录")}</li>`,
      )
      .join("")}</ul>`;
  } else {
    const category = path.startsWith("/c/") ? path.slice(3) : "";
    const products = category
      ? catalog.products.filter((p) => p.category === category)
      : catalog.products;
    content = `<h1>${category ? `${escapeHtml(CATEGORY_NAMES[category])} 订阅价格对比` : `${SITE_NAME} · 订阅之前，先比比。`}</h1><nav>${Object.entries(
      CATEGORY_NAMES,
    )
      .map(([id, name]) => `<a href="/c/${id}">${name}</a>`)
      .join(" · ")}</nav><ul>${products.map(productRow).join("")}</ul>`;
  }
  return `<main>${content}<p>价格、库存与购买条件以店铺实际页面为准。</p></main>`;
}

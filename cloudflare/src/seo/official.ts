import {
  TAX_NAMES,
  HEADLINE_PLAN,
  OFFICIAL_NOTES,
  cny,
  official,
  officialApp,
  officialPlans,
  priceRows,
  priceChannel,
  priceTax,
  observedAt,
  isOldPrice,
  taxPrice,
  amountCny,
  type OfficialPrice,
} from "../../shared/official-prices";
import { escapeHtml } from "./content";

function quote(row: OfficialPrice | undefined) {
  if (!row) return "暂无已核验报价";
  let amounts: string;
  if (priceChannel(row) !== "web" || priceTax(row) === "unknown") {
    amounts = `${escapeHtml(row.display_price)}，约 ${cny(row.cny!)}，${TAX_NAMES[priceTax(row)]}`;
  } else {
    amounts = (["inclusive", "exclusive"] as const)
      .map((basis) => {
        const value = taxPrice(row, basis);
        const converted = value == null ? null : amountCny(row, value);
        return `${basis === "inclusive" ? "含税" : "未税"}：${value == null ? "官方未提供" : `${escapeHtml(row.currency)} ${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}${converted == null ? "" : `，约 ${cny(converted)}`}`}`;
      })
      .join("；");
    if (row.tax_percent != null) amounts += `；税率 ${row.tax_percent}%`;
  }
  return `${amounts}；采集于 ${escapeHtml(observedAt(row))}${isOldPrice(row) ? "；旧报价，不参与最低价" : ""}。<a href="${escapeHtml(row.source_url)}" rel="noreferrer">官方依据</a>`;
}
const quotes = (app: string, plan: string) => {
  const rows = priceRows(app, plan);
  return rows.length
    ? `<table><thead><tr><th scope="col">地区</th><th scope="col">App Store 价格</th><th scope="col">官网直购价格</th></tr></thead><tbody>${official.regions
        .filter((region) => rows.some((r) => r.region === region.code))
        .map(
          (region) =>
            `<tr><th scope="row">${escapeHtml(region.name)}</th>${(["ios", "web"] as const).map((channel) => `<td>${quote(rows.find((r) => r.region === region.code && priceChannel(r) === channel))}</td>`).join("")}</tr>`,
        )
        .join("")}</tbody></table>`
    : "<p>暂无已核验报价。</p>";
};
/** Same channels, tax bases and observation times as the interactive page. */
export function officialContent(path: string) {
  const source = `<p>价格直接来自官方公开来源，按 App Store、官网含税、官网不含税三个渠道分别排行。官网未明确提供的含税或未税金额不反推。人民币按 ${escapeHtml(official.fx.updated_at)} 的汇率换算，逐条显示真实采集时间。</p>`;
  if (path === "/official")
    return `<h1>AI 订阅官方价格 · 各地区与渠道对比</h1>${source}<ul>${official.apps.map((app) => `<li><a href="/official/${app.id}">${escapeHtml(app.name)} 官方价格</a>${quotes(app.id, HEADLINE_PLAN[app.id])}</li>`).join("")}</ul>`;
  const app = officialApp(path.slice(10));
  if (!app) return "";
  const note = OFFICIAL_NOTES[app.id]
    ? `<p>${escapeHtml(OFFICIAL_NOTES[app.id])}</p>`
    : "";
  const plan = officialPlans(app.id).find(
    (p) => p.id === HEADLINE_PLAN[app.id],
  )!;
  return `<h1>${escapeHtml(app.name)} 官方订阅价格 · 各地区与渠道对比</h1>${source}${note}<h2>${escapeHtml(plan.label)} · ${plan.period === "year" ? "年付总价" : "月付"}</h2>${quotes(app.id, plan.id)}`;
}

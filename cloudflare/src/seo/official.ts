import {
  HEADLINE_PLAN,
  OFFICIAL_NOTES,
  cny,
  official,
  officialApp,
  officialPlans,
  rankedPrices,
  regionName,
} from "../../shared/official-prices";
import { escapeHtml } from "./content";

const ranking = (app: string, plan: string) =>
  `<ol>${rankedPrices(app, plan)
    .map(
      (r) =>
        `<li>${escapeHtml(regionName(r.region))}：${escapeHtml(r.display_price)}，约 ${cny(r.cny)}${r.vs_us != null && r.region !== "us" ? `（较美区 ${r.vs_us > 0 ? "+" : ""}${r.vs_us}%）` : ""}</li>`,
    )
    .join("")}</ol>`;

/** Readable first-screen HTML for /official pages; React replaces it on mount. */
export function officialContent(path: string) {
  const source = `<p>数据来自各地区 App Store 公开商品页，采集于 ${escapeHtml(official.collected_at.slice(0, 10))}，人民币按当日汇率换算。</p>`;
  if (path === "/official")
    return `<h1>AI 订阅官方价格 · 各国 App Store 对比</h1>${source}<ul>${official.apps
      .map((app) => {
        const cheapest = rankedPrices(app.id, HEADLINE_PLAN[app.id])[0];
        const plan = officialPlans(app.id).find(
          (p) => p.id === HEADLINE_PLAN[app.id],
        )!;
        return `<li><a href="/official/${app.id}">${escapeHtml(app.name)} 官方价格</a>${cheapest ? ` — ${escapeHtml(plan.label)} 最低 ${escapeHtml(regionName(cheapest.region))}区 ${cny(cheapest.cny)}` : ""}</li>`;
      })
      .join("")}</ul>`;
  const app = officialApp(path.slice(10))!;
  const note = OFFICIAL_NOTES[app.id] ? `<p>${escapeHtml(OFFICIAL_NOTES[app.id])}</p>` : "";
  return `<h1>${escapeHtml(app.name)} 官方订阅价格 · 各国 App Store 对比</h1>${source}${note}${officialPlans(
    app.id,
  )
    .map(
      (plan) =>
        `<h2>${escapeHtml(plan.label)}${plan.period === "year" ? " 年付" : " 月付"}</h2>${ranking(app.id, plan.id)}`,
    )
    .join("")}`;
}

import { SITE_NAME } from "../../shared/site";
import { Link } from "@/components/link";
import * as React from "react";

import { ArrowRight, Info } from "lucide-react";

import { BrandIcon } from "@/components/brand-icon";
import {
  HEADLINE_PLAN,
  OFFICIAL_CATEGORY,
  OFFICIAL_NOTES,
  cny,
  official,
  officialApp,
  officialMeta,
  officialPlans,
  rankedPrices,
  regionName,
  unavailableRegions,
  type RankedPrice,
} from "../../shared/official-prices";
import { date } from "../lib/catalog-format";
import { updatePageMeta } from "../lib/page-meta";
import "./official.css";

const vsUs = (row: RankedPrice) =>
  row.region === "us" || row.vs_us == null ? (
    <span className="official-delta">基准</span>
  ) : (
    <span
      className="official-delta"
      data-tone={row.vs_us < 0 ? "cheaper" : row.vs_us > 0 ? "pricier" : ""}
    >
      {row.vs_us > 0 ? "+" : ""}
      {row.vs_us}%
    </span>
  );

function Source() {
  return (
    <p>
      数据来自各地区 App Store 公开商品页的应用内购买价格，采集于{" "}
      {date(official.collected_at)}；人民币按 {official.fx.source}{" "}
      汇率换算，仅供参考。
    </p>
  );
}

export function OfficialPage({ app }: { app?: string }) {
  const path = app ? `/official/${app}` : "/official";
  React.useEffect(
    () => updatePageMeta(path, null, [], officialMeta(path)),
    [path],
  );
  if (!app) return <OfficialOverview />;
  const meta = officialApp(app);
  if (!meta)
    return (
      <div className="py-20 text-center text-muted-foreground">
        没有这个应用的官方价格。
      </div>
    );
  return <OfficialAppPage app={app} />;
}

function OfficialOverview() {
  return (
    <>
      <div className="catalog-breadcrumb">
        <Link href="/">{SITE_NAME}</Link>
        <span>/</span>官方价格
      </div>
      <div className="catalog-page-title">
        <h1>AI 订阅官方价格 · 各国 App Store 对比</h1>
        <Source />
      </div>
      <div className="official-overview">
        {official.apps.map((app) => {
          const plan = HEADLINE_PLAN[app.id];
          const rows = rankedPrices(app.id, plan);
          const us = rows.find((r) => r.region === "us");
          const cheapest = rows[0];
          const label = officialPlans(app.id).find((p) => p.id === plan)?.label;
          return (
            <Link
              className="official-card"
              href={`/official/${app.id}`}
              key={app.id}
            >
              <header>
                <BrandIcon category={OFFICIAL_CATEGORY[app.id]} size={22} />
                <h2>{app.name}</h2>
                <ArrowRight size={16} />
              </header>
              <small>{label} · 月付</small>
              {cheapest && us ? (
                <dl>
                  <div>
                    <dt>美区</dt>
                    <dd>
                      {us.display_price}
                      <span>≈ {cny(us.cny)}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>最低 · {regionName(cheapest.region)}</dt>
                    <dd data-tone="cheaper">
                      {cny(cheapest.cny)}
                      {vsUs(cheapest)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p>暂无可比价格</p>
              )}
              <footer>
                {officialPlans(app.id).length} 个套餐 · {rows.length} 个地区
              </footer>
            </Link>
          );
        })}
      </div>
      <Notes />
    </>
  );
}

function OfficialAppPage({ app }: { app: string }) {
  const meta = officialApp(app)!;
  const plans = officialPlans(app);
  const [plan, setPlan] = React.useState(HEADLINE_PLAN[app]);
  React.useEffect(() => setPlan(HEADLINE_PLAN[app]), [app]);
  const rows = rankedPrices(app, plan);
  const us = rows.find((r) => r.region === "us");
  const max = Math.max(...rows.map((r) => r.cny), 1);
  const unavailable = unavailableRegions(app);
  const current = plans.find((p) => p.id === plan);
  const listed = new Set(rows.map((r) => r.region));
  const unlisted = official.regions.filter(
    (r) => !listed.has(r.code) && !unavailable.includes(r.code),
  );
  return (
    <>
      <div className="catalog-breadcrumb">
        <Link href="/">{SITE_NAME}</Link>
        <span>/</span>
        <Link href="/official">官方价格</Link>
        <span>/</span>
        {meta.name}
      </div>
      <div className="catalog-page-title">
        <h1>
          <BrandIcon category={OFFICIAL_CATEGORY[app]} size={26} />
          {meta.name} 官方订阅价格 · 各国 App Store 对比
        </h1>
        <Source />
        {OFFICIAL_NOTES[app] && (
          <p className="official-gaps">
            <Info size={14} />
            {OFFICIAL_NOTES[app]}
          </p>
        )}
      </div>
      <nav className="official-apps" aria-label="选择应用">
        {official.apps.map((a) => (
          <Link
            key={a.id}
            href={`/official/${a.id}`}
            aria-current={a.id === app ? "page" : undefined}
          >
            <BrandIcon category={OFFICIAL_CATEGORY[a.id]} size={16} />
            {a.name}
          </Link>
        ))}
      </nav>
      <div className="official-plans" role="tablist" aria-label="选择套餐">
        {plans.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={p.id === plan}
            onClick={() => setPlan(p.id)}
          >
            {p.label}
            <small>{p.period === "year" ? "年付" : "月付"}</small>
          </button>
        ))}
      </div>
      {rows.length > 0 && (
        <div className="official-summary">
          <div>
            <span>最便宜</span>
            <b>{regionName(rows[0].region)}</b>
            <strong>{cny(rows[0].cny)}</strong>
            <small>
              {rows[0].display_price} {vsUs(rows[0])}
            </small>
          </div>
          <div>
            <span>美区基准</span>
            <b>美国</b>
            <strong>{us ? cny(us.cny) : "—"}</strong>
            <small>{us?.display_price || "美区未列出"}</small>
          </div>
          <div>
            <span>最贵</span>
            <b>{regionName(rows.at(-1)!.region)}</b>
            <strong>{cny(rows.at(-1)!.cny)}</strong>
            <small>
              {rows.at(-1)!.display_price} {vsUs(rows.at(-1)!)}
            </small>
          </div>
        </div>
      )}
      <section
        className="official-ranking"
        aria-label={`${current?.label} 各地区价格`}
      >
        <h2>
          {current?.label}
          {current?.period === "year" ? " 年付" : " 月付"} · 各地区价格排名
        </h2>
        <ol>
          {rows.map((row, index) => (
            <li key={row.region}>
              <span className="official-rank">{index + 1}</span>
              <span className="official-region">
                {regionName(row.region)}
                <small>{row.currency}</small>
              </span>
              <span className="official-local">{row.display_price}</span>
              <span className="official-bar" aria-hidden="true">
                <i style={{ width: `${(row.cny / max) * 100}%` }} />
              </span>
              <b className="official-cny">{cny(row.cny)}</b>
              {vsUs(row)}
            </li>
          ))}
        </ol>
        {(unavailable.length > 0 || unlisted.length > 0) && (
          <p className="official-gaps">
            <Info size={14} />
            {unavailable.length > 0 &&
              `${unavailable.map(regionName).join("、")}：该地区商店页面不可用，可能未上架。`}
            {unlisted.length > 0 &&
              `${unlisted.map((r) => r.name).join("、")}：商店页面未列出此套餐。`}
          </p>
        )}
      </section>
      <section className="official-matrix" aria-label="全部套餐对比">
        <h2>{meta.name} 全部套餐 · 人民币对比</h2>
        <div className="official-table-wrap">
          <table>
            <thead>
              <tr>
                <th>地区</th>
                {plans.map((p) => (
                  <th key={p.id}>
                    {p.label}
                    {p.period === "year" ? "" : " /月"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {official.regions
                .filter((r) => !unavailable.includes(r.code))
                .map((region) => (
                  <tr key={region.code}>
                    <th>{region.name}</th>
                    {plans.map((p) => {
                      const row = rankedPrices(app, p.id);
                      const hit = row.find((r) => r.region === region.code);
                      return (
                        <td
                          key={p.id}
                          data-best={hit && hit === row[0] ? "" : undefined}
                          title={hit?.display_price}
                        >
                          {hit ? cny(hit.cny) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
      <Link className="official-related" href={`/c/${OFFICIAL_CATEGORY[app]}`}>
        <span>
          <b>查看 {meta.name} 代充与成品号报价</b>
          <small>和官方地区价放在一起比较，再决定怎么买。</small>
        </span>
        <ArrowRight size={16} />
      </Link>
      <Notes />
    </>
  );
}

function Notes() {
  return (
    <section className="official-notes">
      <h2>读懂这些价格</h2>
      <dl>
        <dt>这是什么价格？</dt>
        <dd>
          各地区 App Store
          内订阅的标价，通常已含当地税费。网页版（官网信用卡订阅）价格可能不同。
        </dd>
        <dt>能直接买最便宜的地区吗？</dt>
        <dd>
          需要该地区的 Apple
          ID，以及当地可用的付款方式（礼品卡或当地银行卡）。跨区购买可能违反服务条款，账号与售后风险自行承担。
        </dd>
        <dt>人民币价格准吗？</dt>
        <dd>
          按采集当天汇率换算，未计入礼品卡溢价或兑换手续费，实际花费通常更高。
        </dd>
      </dl>
    </section>
  );
}

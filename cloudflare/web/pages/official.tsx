import * as React from "react";
import { ArrowRight, Info } from "lucide-react";
import { SITE_NAME } from "../../shared/site";
import { Link } from "@/components/link";
import { BrandIcon } from "@/components/brand-icon";
import { Button } from "@/components/ui/button";
import {
  CHART_CHANNELS,
  CHART_CHANNEL_NAMES,
  HEADLINE_PLAN,
  OFFICIAL_CATEGORY,
  OFFICIAL_NOTES,
  cny,
  official,
  officialApp,
  officialMeta,
  officialPlans,
  chartPrices,
  regionName,
  type ChartChannel,
  type ChartPriceRow,
} from "../../shared/official-prices";
import { date } from "../lib/catalog-format";
import { useOfficial } from "../lib/official";
import { PageSkeleton } from "@/components/page-loading";
import { RequestError } from "../components/request-error";
import { updatePageMeta } from "../lib/page-meta";
import "./official.css";

function Source() {
  return (
    <p>
      报价直接来自官方公开来源，逐条显示采集时间；人民币按{" "}
      {date(official.fx.updated_at)} 的汇率换算。
      含税、未税和税费未明确的标价分别标注，不计算不同税费口径之间的优惠幅度。
    </p>
  );
}
export function OfficialPage({ app }: { app?: string }) {
  const path = app ? `/official/${app}` : "/official";
  const activeApp = app || "chatgpt";
  const { data, error, retry } = useOfficial();
  React.useEffect(() => {
    if (data) updatePageMeta(path, null, [], officialMeta(path));
  }, [path, data]);
  if (!data)
    return error ? (
      <RequestError message={error} retry={retry} />
    ) : (
      <PageSkeleton variant="table" label="正在读取官方价格…" />
    );
  if (app && !officialApp(app))
    return (
      <div className="py-20 text-center text-muted-foreground">
        没有这个应用的官方价格。
      </div>
    );
  return (
    <>
      <div className="catalog-breadcrumb">
        <Link href="/">{SITE_NAME}</Link>
        <span>/</span>
        {app ? (
          <>
            <Link href="/official">官方价格</Link>
            <span>/</span>
            {officialApp(app)!.name}
          </>
        ) : (
          "官方价格"
        )}
      </div>
      <div className="catalog-page-title">
        <h1>
          {app ? `${officialApp(app)!.name} 官方订阅价格` : "AI 订阅官方价格"} ·
          各地区与渠道对比
        </h1>
        <Source />
      </div>
      <OfficialAppPage key={activeApp} app={activeApp} />
      <Notes />
    </>
  );
}
function ChartDelta({ row }: { row: ChartPriceRow }) {
  if (row.vs_us != null) {
    if (row.region === "us") return <span className="official-delta">基准</span>;
    return (
      <span
        className="official-delta"
        data-tone={row.vs_us < 0 ? "cheaper" : row.vs_us > 0 ? "pricier" : ""}
      >
        {row.vs_us > 0 ? "+" : ""}
        {row.vs_us}%
      </span>
    );
  }
  if (row.tax_percent != null)
    return <span className="official-delta">{row.tax_percent}%税</span>;
  return (
    <span className="official-delta">
      {row.tax === "inclusive"
        ? "含税"
        : row.tax === "exclusive"
          ? "未税"
          : "标价"}
    </span>
  );
}
function PriceChartRanking({
  app,
  plan,
  label,
  period,
}: {
  app: string;
  plan: string;
  label: string;
  period: "month" | "year";
}) {
  const [basis, setBasis] = React.useState<ChartChannel>("ios");
  const result = chartPrices(app, plan, basis);
  const maxCny = result.rows.reduce((m, r) => Math.max(m, r.cny), 0) || 1;
  return (
    <section
      className="official-ranking"
      aria-label={`${label} ${result.label} 价格从低到高排行`}
    >
      <h2>
        {label} · {period === "year" ? "年付总价" : "月付"} · {result.label}{" "}
        价格排行（从低到高）
      </h2>
      <nav
        className="official-channels official-plans"
        aria-label="切换图表价格渠道"
      >
        {CHART_CHANNELS.map((id) => (
          <Button
            variant="outline"
            key={id}
            aria-pressed={id === basis}
            onClick={() => setBasis(id)}
          >
            {CHART_CHANNEL_NAMES[id]}
          </Button>
        ))}
      </nav>
      {result.fallback_unknown ? (
        <p className="official-caption">
          该应用官网公开标价未区分含税与不含税，已自动归入「官网标价」并按人民币折算价从低到高排列。
        </p>
      ) : (
        <p className="official-caption">
          当前展示「{result.label}」有效报价，按人民币折算价从低到高排序。
        </p>
      )}
      {result.rows.length > 0 ? (
        <ol>
          {result.rows.map((row, index) => (
            <li key={row.region}>
              <span className="official-rank">{index + 1}</span>
              <span className="official-region">
                {regionName(row.region)}
                <small>{row.currency}</small>
              </span>
              <span className="official-local">{row.display_price}</span>
              <span className="official-bar" aria-hidden="true">
                <i style={{ width: `${(row.cny / maxCny) * 100}%` }} />
              </span>
              <b className="official-cny">{cny(row.cny)}</b>
              <ChartDelta row={row} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="official-empty">
          当前「{CHART_CHANNEL_NAMES[basis]}
          」渠道暂无已核验的该套餐报价；可切换上方按钮查看其他渠道。
        </p>
      )}
    </section>
  );
}
function OfficialAppPage({ app }: { app: string }) {
  const meta = officialApp(app)!;
  const plans = officialPlans(app);
  const [plan, setPlan] = React.useState(HEADLINE_PLAN[app]);
  const current = plans.find((p) => p.id === plan)!;
  return (
    <>
      {OFFICIAL_NOTES[app] && (
        <p className="official-gaps">
          <Info size={14} />
          {OFFICIAL_NOTES[app]}
        </p>
      )}
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
          <Button
            variant="outline"
            key={p.id}
            role="tab"
            aria-selected={p.id === plan}
            onClick={() => setPlan(p.id)}
          >
            {p.label}
            <small>{p.period === "year" ? "年付" : "月付"}</small>
          </Button>
        ))}
      </div>
      <PriceChartRanking
        app={app}
        plan={plan}
        label={current.label}
        period={current.period}
      />
      <Link className="official-related" href={`/c/${OFFICIAL_CATEGORY[app]}`}>
        <span>
          <b>查看 {meta.name} 代充与成品号报价</b>
          <small>核对套餐、渠道和税费口径，再决定怎么买。</small>
        </span>
        <ArrowRight size={16} />
      </Link>
    </>
  );
}
function Notes() {
  return (
    <section className="official-notes">
      <h2>读懂这些价格</h2>
      <dl>
        <dt>含税、未税和商店标价如何比较？</dt>
        <dd>
          官网明确提供的含税、未税金额并列展示，未提供的金额不反推。App Store
          和未明确税费的官网金额标注为“税费以结账为准”；不同税费口径不直接计算优惠幅度。
        </dd>
        <dt>为什么有的渠道或套餐没有报价？</dt>
        <dd>
          当前官网来源已接入 ChatGPT、Gemini；Claude、Grok
          官网具体套餐仍待核验。未验证的年付计价单位、应用级价格区间和促销资格价不参与排名。
        </dd>
        <dt>数据多久有效？</dt>
        <dd>
          每条展示真实采集时间。最近采集失败或超过7天的旧报价不参与最低价，仍可查阅其来源和原始观察时间。
        </dd>
        <dt>人民币金额是实际扣款吗？</dt>
        <dd>
          按上方汇率日期换算，未计支付渠道汇差、银行手续费或礼品卡溢价。地区资格、付款方式及实际税费以官方结账页为准。
        </dd>
      </dl>
    </section>
  );
}

import * as React from "react";
import { ArrowRight, Info } from "lucide-react";
import { SITE_NAME } from "../../shared/site";
import { Link } from "@/components/link";
import { BrandIcon } from "@/components/brand-icon";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CHANNEL_NAMES,
  TAX_NAMES,
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
  priceRows,
  priceChannel,
  priceTax,
  observedAt,
  isOldPrice,
  taxPrice,
  amountCny,
  sortedRegions,
  sortPrice,
  type OfficialSort,
  type ChannelFilter,
  type OfficialPrice,
  type OfficialChannel,
} from "../../shared/official-prices";
import { date } from "../lib/catalog-format";
import { updatePageMeta } from "../lib/page-meta";
import "./official.css";

const CHANNELS: ChannelFilter[] = ["all", "web", "ios", "google_play"];
function ChannelTabs({
  value,
  onChange,
}: {
  value: ChannelFilter;
  onChange: (v: ChannelFilter) => void;
}) {
  return (
    <nav className="official-channels official-plans" aria-label="选择价格渠道">
      {CHANNELS.map((id) => (
        <Button
          variant="outline"
          key={id}
          aria-pressed={id === value}
          onClick={() => onChange(id)}
        >
          {id === "all" ? "全部渠道" : CHANNEL_NAMES[id]}
        </Button>
      ))}
    </nav>
  );
}
function Source() {
  return (
    <p>
      报价直接来自官方公开来源，逐条显示采集时间；人民币按{" "}
      {date(official.fx.updated_at)} 的汇率换算。
      含税、未税和税费未明确的标价分别标注，不计算不同税费口径之间的优惠幅度。
    </p>
  );
}
function EmptyChannel({
  app,
  channel,
}: {
  app?: string;
  channel: ChannelFilter;
}) {
  if (channel === "google_play")
    return (
      <p className="official-empty">
        <Info size={18} />
        Google
        Play：待核验具体套餐与订阅周期。应用级内购价格区间不作为月费，也不参与最低价。
      </p>
    );
  if (channel === "web" && app && !["chatgpt", "gemini"].includes(app))
    return (
      <p className="official-empty">
        官网报价待核验；当前已接入 ChatGPT、Gemini 的官方地区价格来源。
      </p>
    );
  return null;
}
/** Minima are separated by channel and tax basis; never choose a winner across unlike tax bases. */
function ChannelMinimum({
  app,
  plan,
  channel,
}: {
  app: string;
  plan: string;
  channel: OfficialChannel;
}) {
  const rows = rankedPrices(app, plan, channel);
  return (
    <div>
      <span>{CHANNEL_NAMES[channel]} · 分税费口径最低标价</span>
      {(["inclusive", "exclusive", "unknown"] as const).map((tax) => {
        const candidates = rows
          .flatMap((row) => {
            const amount = taxPrice(row, tax);
            if (amount == null) return [];
            const converted = amountCny(row, amount);
            return converted == null ? [] : [{ row, amount, converted }];
          })
          .sort((a, b) => a.converted - b.converted);
        const best = candidates[0];
        return best ? (
          <div className="official-minimum" key={tax}>
            <strong>{cny(best.converted)}</strong>
            <b>{regionName(best.row.region)}</b>
            <small>
              {best.row.currency}{" "}
              {best.amount.toLocaleString("zh-CN", {
                maximumFractionDigits: 2,
              })}{" "}
              · {TAX_NAMES[tax]}
            </small>
          </div>
        ) : null;
      })}
      {!rows.length && <small>暂无7天内核验成功的报价</small>}
    </div>
  );
}
export function OfficialPage({ app }: { app?: string }) {
  const path = app ? `/official/${app}` : "/official";
  const [channel, setChannel] = React.useState<ChannelFilter>("all");
  React.useEffect(
    () => updatePageMeta(path, null, [], officialMeta(path)),
    [path],
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
      <ChannelTabs value={channel} onChange={setChannel} />
      <EmptyChannel app={app} channel={channel} />
      {app ? (
        <OfficialAppPage key={app} app={app} channel={channel} />
      ) : (
        <OfficialOverview channel={channel} />
      )}
      <Notes />
    </>
  );
}
function OfficialOverview({ channel }: { channel: ChannelFilter }) {
  return (
    <div className="official-overview">
      {official.apps.map((app) => {
        const plan = HEADLINE_PLAN[app.id];
        const rows = rankedPrices(app.id, plan, channel);
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
            <small>
              {officialPlans(app.id).find((p) => p.id === plan)?.label} · 月付
            </small>
            {(channel === "all" || channel === "web") && (
              <ChannelMinimum app={app.id} plan={plan} channel="web" />
            )}
            {(channel === "all" || channel === "ios") && (
              <ChannelMinimum app={app.id} plan={plan} channel="ios" />
            )}
            <footer>
              {new Set(rows.map((r) => r.region)).size} 个地区 · {rows.length}{" "}
              条当前报价
            </footer>
          </Link>
        );
      })}
    </div>
  );
}
function QuoteAmount({ row }: { row: OfficialPrice }) {
  if (priceChannel(row) !== "web" || priceTax(row) === "unknown") {
    return (
      <div className="official-amount">
        <b>{row.display_price}</b>
        <span className="official-converted">≈ {cny(row.cny!)}</span>
        <small>{TAX_NAMES[priceTax(row)]}</small>
      </div>
    );
  }
  return (
    <>
      {(["inclusive", "exclusive"] as const).map((basis) => {
        const value = taxPrice(row, basis);
        const converted = value == null ? null : amountCny(row, value);
        return (
          <div className="official-amount" key={basis}>
            <span className="official-tax-label">
              {basis === "inclusive" ? "含税" : "未税"}
            </span>
            {value == null ? (
              <span className="official-unavailable">官方未提供</span>
            ) : (
              <>
                <b>
                  {row.currency}{" "}
                  {value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
                </b>
                {converted != null && (
                  <span className="official-converted">≈ {cny(converted)}</span>
                )}
              </>
            )}
          </div>
        );
      })}
      {row.tax_percent != null && <small>税率 {row.tax_percent}%</small>}
    </>
  );
}
function QuoteSource({ row }: { row: OfficialPrice }) {
  return (
    <div className="official-quote-source">
      {isOldPrice(row) && <small>旧报价 · 不参与最低价</small>}
      <time dateTime={observedAt(row)}>{date(observedAt(row))}</time>
      <a href={row.source_url} target="_blank" rel="noreferrer">
        官方依据 ↗
      </a>
      {row.error && (
        <small>
          最近更新失败 · {row.attempted_at ? date(row.attempted_at) : ""}
        </small>
      )}
    </div>
  );
}
function OfficialAppPage({
  app,
  channel,
}: {
  app: string;
  channel: ChannelFilter;
}) {
  const meta = officialApp(app)!;
  const plans = officialPlans(app);
  const [plan, setPlan] = React.useState(HEADLINE_PLAN[app]);
  const [sort, setSort] = React.useState<OfficialSort>("region");
  const [direction, setDirection] = React.useState<"asc" | "desc">("asc");
  const current = plans.find((p) => p.id === plan)!;
  const rows = priceRows(app, plan, channel);
  const sortOptions: { value: OfficialSort; label: string }[] = [
    { value: "region", label: "地区默认顺序" },
    { value: "ios", label: "App Store 价格" },
    { value: "web_inclusive", label: "官网含税价" },
    { value: "web_exclusive", label: "官网未税价" },
    { value: "web_unknown", label: "官网标价（税费未明确）" },
  ].filter(
    (option) =>
      option.value === "region" ||
      rows.some((row) => sortPrice(row, option.value as OfficialSort) != null),
  ) as { value: OfficialSort; label: string }[];
  const activeSort = sortOptions.some((option) => option.value === sort)
    ? sort
    : "region";
  const regions = sortedRegions(rows, activeSort, direction);
  const errors = official.failures.filter(
    (f) =>
      f.app === app && (channel === "all" || (f.channel || "ios") === channel),
  );
  const channels = (["ios", "web"] as const).filter(
    (c) => channel === "all" || channel === c,
  );
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
      {channels.length > 0 && (
        <div className="official-summary">
          {channels.map((c) => (
            <ChannelMinimum key={c} app={app} plan={plan} channel={c} />
          ))}
        </div>
      )}
      {channel !== "google_play" && (
        <section
          className="official-ranking"
          aria-label={`${current.label} 各地区与渠道报价`}
        >
          <h2>
            {current.label} · {current.period === "year" ? "年付总价" : "月付"}{" "}
            · 按地区并排核对
          </h2>
          <p className="official-caption">
            最低标价仅在相同渠道与税费口径内选取。旧报价保留供查阅，不参与最低价。
          </p>
          {rows.length > 0 && (
            <div className="official-sort">
              <div className="official-sort-field">
                <label htmlFor="official-sort-basis">排序依据</label>
                <Select
                  value={activeSort}
                  onValueChange={(value) => setSort(value as OfficialSort)}
                >
                  <SelectTrigger
                    id="official-sort-basis"
                    aria-label="排序依据"
                    className="w-52"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sortOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="official-sort-field">
                <label htmlFor="official-sort-direction">顺序</label>
                <Select
                  value={direction}
                  disabled={activeSort === "region"}
                  onValueChange={(value) =>
                    setDirection(value as "asc" | "desc")
                  }
                >
                  <SelectTrigger
                    id="official-sort-direction"
                    aria-label="价格排序方向"
                    className="w-40"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">价格从低到高</SelectItem>
                    <SelectItem value="desc">价格从高到低</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <span role="status">
                {activeSort === "region"
                  ? "保持地区默认顺序"
                  : "按人民币换算价排序；缺少对应价格或旧报价的地区排在最后"}
              </span>
            </div>
          )}
          {rows.length ? (
            <div className="official-table-wrap">
              <table className="official-quotes">
                <thead>
                  <tr>
                    <th scope="col">地区</th>
                    {channels.map((c) => (
                      <th scope="col" key={c}>
                        {CHANNEL_NAMES[c]} 价格
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {regions.map((region) => (
                    <tr key={region.code}>
                      <th scope="row">{region.name}</th>
                      {channels.map((c) => {
                        const row = rows.find(
                          (r) =>
                            r.region === region.code && priceChannel(r) === c,
                        );
                        return (
                          <td
                            key={c}
                            data-old={(row && isOldPrice(row)) || undefined}
                          >
                            {row ? (
                              <>
                                <QuoteAmount row={row} />
                                <QuoteSource row={row} />
                              </>
                            ) : (
                              <span className="official-unavailable">
                                暂无已核验报价
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="official-empty">
              此渠道尚无经过核验的该套餐报价。未列出不代表该地区未上架。
            </p>
          )}
          {errors.length > 0 && (
            <details className="official-gaps-list">
              <summary>
                {errors.length} 个来源最近采集失败，未将旧数据标为新报价
              </summary>
              <ul>
                {errors.map((f, i) => (
                  <li key={i}>
                    {regionName(f.region)} · {CHANNEL_NAMES[f.channel || "ios"]}
                    ：{f.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
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
          当前官网来源已接入 ChatGPT、Gemini；Claude、Grok 官网及 Google Play
          具体套餐仍待核验。未验证的年付计价单位、应用级价格区间和促销资格价不参与排名。
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

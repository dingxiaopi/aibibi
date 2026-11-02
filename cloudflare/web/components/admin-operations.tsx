import { Link } from "@/components/link";
import * as React from "react";
import { useApi } from "@/lib/use-api";
import { PageSkeleton, LoadingStatus } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Row = Record<string, any>;
const categoryNames: Record<string, string> = {
  gpt: "ChatGPT",
  claude: "Claude",
  grok: "Grok",
  gemini: "Gemini",
  cursor: "Cursor",
  other: "周边",
};
const date = (v: string | null) =>
  v && Number.isFinite(Date.parse(v))
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Singapore",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(v))
    : "暂无记录";
const money = (v: number | null) =>
  v == null
    ? "暂无可用价"
    : `¥${v.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
const blockerNames: Record<string, string> = {
  paused: "暂停",
  expired: "过期",
  failed: "采集失败",
  review: "待复核",
  missing: "下架",
  out: "售罄",
  delayed: "兑换受限",
  unknown: "库存/可用性未知",
};
function useData(path: string, revision: unknown) {
  const { data, error, loading, retry } = useApi(path, 0, revision);
  return { data, error, loading, refresh: retry };
}
function Feedback({
  error,
  loading,
  hasData = false,
  retry,
}: {
  error: string;
  loading: boolean;
  hasData?: boolean;
  retry: () => void;
}) {
  if (error)
    return (
      <div role="alert" className="my-5 text-sm text-destructive">
        {error}{" "}
        <Button size="sm" variant="outline" onClick={retry}>
          重试
        </Button>
      </div>
    );
  if (loading)
    return hasData ? (
      <LoadingStatus>正在更新状态…</LoadingStatus>
    ) : (
      <PageSkeleton variant="console" label="正在读取状态…" />
    );
  return null;
}
function Candidates({ sku }: { sku: string }) {
  const [offset, setOffset] = React.useState(0);
  const { data, error, loading, refresh } = useData(
    `/api/admin/coverage/candidates?sku=${encodeURIComponent(sku)}&offset=${offset}`,
    sku,
  );
  const [message, setMessage] = React.useState("");
  return (
    <div className="coverage-candidates">
      <h4 className="font-semibold">待审名称线索</h4>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        按品牌与套餐关键词查找，优先显示尚未给该规格报价的店铺。名称匹配不代表同规格；地区、渠道、时长、价格和库存仍须读取原店详情核验。
      </p>
      <Feedback
        error={error}
        loading={loading}
        hasData={Boolean(data)}
        retry={refresh}
      />
      {data && (
        <>
          <p className="mt-3 text-xs text-muted-foreground">
            匹配词：{data.terms.brands.join(" / ")}
            {data.terms.tier ? ` + ${data.terms.tier}` : ""} · 共 {data.total}{" "}
            条
          </p>
          {!data.items.length && (
            <p className="my-5 text-sm">
              暂无匹配线索。可调整收录方向或从其他已登记店铺寻找；不会自动归类商品。
            </p>
          )}
          <ul className="mt-3 divide-y divide-border">
            {data.items.map((item: Row) => (
              <li className="py-4" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.shop_name} · {item.source_id} ·{" "}
                      {item.existing_shop
                        ? "该店已有本规格报价"
                        : "该店尚无本规格报价"}
                    </p>
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {item.reason} · 观察于 {date(item.data_at)} UTC+8
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={item.shop_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        查看原店 ↗
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/admin/reviews?id=${encodeURIComponent(item.id)}`}
                      >
                        查看待审记录
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            `python3 -m collector.review inspect ${item.shop_id} ${item.source_id}`,
                          );
                          setMessage(
                            "已复制本地详情复核命令，在 site 目录运行后完整阅读详情。",
                          );
                        } catch {
                          setMessage(
                            `本地复核：python3 -m collector.review inspect ${item.shop_id} ${item.source_id}`,
                          );
                        }
                      }}
                    >
                      复制复核命令
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {message && (
            <p role="status" className="my-3 break-all text-sm text-primary">
              {message}
            </p>
          )}
          {data.total > 20 && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                disabled={!offset}
                onClick={() => setOffset((n) => Math.max(0, n - 20))}
              >
                上一页线索
              </Button>
              <span className="text-xs">
                第 {Math.floor(offset / 20) + 1} / {Math.ceil(data.total / 20)}{" "}
                页
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={offset + 20 >= data.total}
                onClick={() => setOffset((n) => n + 20)}
              >
                下一页线索
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
function Coverage({ revision }: { revision: unknown }) {
  const { data, error, loading, refresh } = useData(
    "/api/admin/coverage",
    revision,
  );
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [gap, setGap] = React.useState("gaps");
  const [page, setPage] = React.useState(0);
  const [selected, setSelected] = React.useState<string | null>(null);
  React.useEffect(() => {
    setPage(0);
    setSelected(null);
  }, [query, category, gap]);
  const rows: Row[] = (data?.products || [])
    .filter(
      (p: Row) =>
        (category === "all" || p.category === category) &&
        (gap === "all" ||
          (gap === "gaps" ? p.gap !== "compared" : p.gap === gap)) &&
        `${p.name} ${p.spec} ${p.channel}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort(
      (a: Row, b: Row) =>
        a.ready_shop_count - b.ready_shop_count ||
        a.category.localeCompare(b.category) ||
        a.name.localeCompare(b.name, "zh-CN"),
    );
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">让同一规格有更多选择</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            按去重后的有效有货店数定位缺口。暂无可用价优先，其次只有一家店；暂停、过期、待审和受限报价不计入。
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={refresh}>
          刷新覆盖
        </Button>
      </div>
      <Feedback
        error={error}
        loading={loading}
        hasData={Boolean(data)}
        retry={refresh}
      />
      {data && (
        <>
          <div className="operations-metrics">
            {[
              ["empty", "暂无可用价", data.summary.empty],
              ["single", "仅一家可用", data.summary.single],
              ["compared", "可跨店比较", data.summary.compared],
              ["all", "已审核规格", data.summary.products],
            ].map(([value, label, n]) => (
              <button
                key={value}
                type="button"
                className={`operations-metric${gap === value ? " is-selected" : ""}`}
                onClick={() => setGap(String(value))}
                aria-pressed={gap === value}
              >
                <strong>{n}</strong>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="operations-filters">
            <Input
              aria-label="搜索覆盖规格"
              placeholder="搜索规格、渠道或品牌"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="覆盖品牌分类">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分类</SelectItem>
                {Object.entries(categoryNames).map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={gap} onValueChange={setGap}>
              <SelectTrigger aria-label="覆盖情况">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gaps">全部待补齐</SelectItem>
                <SelectItem value="empty">暂无可用价</SelectItem>
                <SelectItem value="single">仅一家可用</SelectItem>
                <SelectItem value="compared">可跨店比较</SelectItem>
                <SelectItem value="all">全部规格</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="my-3 text-xs text-muted-foreground">
            筛选结果 {rows.length} 种 · 全站 {data.summary.pending} 条待审记录 ·
            有效期 {data.hours} 小时 · 统计于 {date(data.at)} UTC+8
          </p>
          {!rows.length && (
            <p className="my-8 text-sm text-muted-foreground">
              没有符合条件的规格，试试其他分类或关键词。
            </p>
          )}
          <div className="space-y-3">
            {rows.slice(page * 15, page * 15 + 15).map((p) => (
              <article key={p.id} className="coverage-row">
                <div className="coverage-row-main">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/sku/${p.id}`}
                      className="font-semibold hover:text-primary"
                    >
                      {p.name} ↗
                    </Link>
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {p.spec}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {Object.entries(p.blockers)
                        .filter(([, n]) => Number(n) > 0)
                        .map(([key, n]) => `${blockerNames[key]} ${n}`)
                        .join(" · ") || "暂无异常报价"}
                    </p>
                  </div>
                  <div className="coverage-row-price">
                    <strong className="text-primary">
                      {money(p.min_price)}
                    </strong>
                    <span>
                      {p.ready_shop_count} 家可用 / {p.shop_count} 家启用店铺
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-expanded={selected === p.id}
                    aria-controls={`candidates-${p.id}`}
                    onClick={() => setSelected(selected === p.id ? null : p.id)}
                  >
                    {selected === p.id ? "收起线索" : "查找补齐线索"}
                  </Button>
                </div>
                {selected === p.id && (
                  <div id={`candidates-${p.id}`}>
                    <Candidates key={p.id} sku={p.id} />
                  </div>
                )}
              </article>
            ))}
          </div>
          {rows.length > 15 && (
            <div className="mt-5 flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                disabled={!page}
                onClick={() => {
                  setPage((n) => n - 1);
                  setSelected(null);
                }}
              >
                上一页规格
              </Button>
              <span className="text-sm">
                第 {page + 1} / {Math.ceil(rows.length / 15)} 页
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * 15 >= rows.length}
                onClick={() => {
                  setPage((n) => n + 1);
                  setSelected(null);
                }}
              >
                下一页规格
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
function Transfers({
  revision,
  resume,
}: {
  revision: unknown;
  resume: () => void;
}) {
  const { data, error, loading, refresh } = useData(
    "/api/admin/collection-status",
    revision,
  );
  const [problems, setProblems] = React.useState(false);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">采集状态与推送进度</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            采集成功与推送完成分别记录；推送不会刷新报价的原始核验时间。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          刷新采集与推送
        </Button>
      </div>
      <Feedback
        error={error}
        loading={loading}
        hasData={Boolean(data)}
        retry={refresh}
      />
      {data && (
        <>
          <div className="operations-metrics">
            {[
              ["可用报价", data.health.ready],
              ["已过期", data.health.expired],
              ["12小时内到期", data.health.expiring],
              [
                "失败 / 待复核",
                `${data.health.failed} / ${data.health.review}`,
              ],
            ].map(([label, n]) => (
              <div className="operations-metric" key={label}>
                <strong>{n}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <h4 className="mt-6 font-semibold">最近推送任务</h4>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            最多显示20次任务。完成表示所有批次已接收，仍需查看各店采集结果。旧版未记录任务的导入不会补造历史。
          </p>
          {!data.transfers.length && (
            <p className="my-5 rounded-lg bg-secondary p-4 text-sm">
              暂无推送任务记录。下次通过命令行推送或后台导入文件时，会自动登记并保存进度。
            </p>
          )}
          <div className="mt-4 space-y-3">
            {data.transfers.map((t: Row) => {
              const interrupted =
                t.status === "running" &&
                (!t.lease_until || Date.parse(t.lease_until) < Date.now()) &&
                Date.now() - Date.parse(t.updated_at) > 120000;
              const label = interrupted
                ? "等待继续"
                : (
                    {
                      pending: "等待推送",
                      running: "推送中 / 待继续",
                      failed: "推送中断",
                      complete: "推送完成",
                    } as Row
                  )[t.status];
              return (
                <article
                  className="rounded-lg border border-border p-4"
                  key={t.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <strong>{label}</strong>
                      <span className="ml-3 text-sm text-muted-foreground">
                        {t.done_batches} / {t.total_batches} 批
                      </span>
                    </div>
                    {t.status !== "complete" && (
                      <Button variant="outline" size="sm" onClick={resume}>
                        选择原文件继续
                      </Button>
                    )}
                  </div>
                  <progress
                    className="transfer-progress mt-3"
                    aria-label="已接收批次"
                    max={t.total_batches}
                    value={t.done_batches}
                  />
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">
                    {t.counts.shops} 家店 · {t.counts.quotes} 条报价 ·{" "}
                    {t.counts.review_items} 条候选 · {t.counts.products} 种规格
                    · {t.counts.mapping_updates} 条映射
                  </p>
                  <p className="text-xs leading-6 text-muted-foreground">
                    采集包时间：{date(t.source_at)} · 最近接收：
                    {date(t.updated_at)} UTC+8
                  </p>
                  {t.error && (
                    <p className="mt-2 break-words text-sm text-destructive">
                      第 {Number(t.failed_index) + 1} 批：{t.error}
                    </p>
                  )}
                  {t.status !== "complete" && (
                    <p className="mt-2 text-xs leading-6 text-muted-foreground">
                      使用原采集包重跑推送或重新选择原文件，将跳过已完成批次。本批可能部分写入；更改文件会生成新任务。
                    </p>
                  )}
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">任务标识</summary>
                    <code className="mt-2 block break-all">{t.id}</code>
                  </details>
                </article>
              );
            })}
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <h4 className="font-semibold">已接收的店铺状态</h4>
            <Button
              variant={problems ? "default" : "outline"}
              size="sm"
              aria-pressed={problems}
              onClick={() => setProblems((v) => !v)}
            >
              {problems ? "显示全部店铺" : "只看需处理店铺"}
            </Button>
          </div>
          <div className="mt-3 table-scroll">
            <table className="data-table operations-shops">
              <thead>
                <tr>
                  <th>店铺 / 状态</th>
                  <th>成功观察 / 最近尝试（UTC+8）</th>
                  <th>可用 / 已审核报价</th>
                  <th>待处理</th>
                </tr>
              </thead>
              <tbody>
                {data.shops
                  .filter(
                    (s: Row) =>
                      !problems ||
                      (s.enabled &&
                        (s.status !== "ok" ||
                          s.expiring ||
                          s.expired ||
                          s.failed ||
                          s.review)),
                  )
                  .map((s: Row) => (
                    <tr key={s.id}>
                      <td>
                        <Link
                          href={`/shops/${s.id}`}
                          className="font-semibold hover:text-primary"
                        >
                          {s.name}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {!s.enabled
                            ? "已暂停"
                            : s.status === "ok"
                              ? "最近采集成功"
                              : "最近采集失败"}
                        </p>
                      </td>
                      <td>
                        <p>{date(s.checked_at)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          最近尝试 {date(s.attempted_at)}
                        </p>
                      </td>
                      <td>
                        {s.ready} / {s.total}
                      </td>
                      <td>
                        <p className="text-xs">
                          过期 {s.expired} · 即将过期 {s.expiring} · 待复核{" "}
                          {s.review}
                        </p>
                        {s.error && (
                          <p className="mt-1 max-w-sm break-words text-xs text-destructive">
                            {s.error}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {problems &&
            !data.shops.some(
              (s: Row) =>
                s.enabled &&
                (s.status !== "ok" ||
                  s.expiring ||
                  s.expired ||
                  s.failed ||
                  s.review),
            ) && (
              <p className="my-4 text-sm text-muted-foreground">
                当前没有符合条件的店铺。
              </p>
            )}
          <p className="mt-4 text-xs text-muted-foreground">
            统计于 {date(data.at)} UTC+8 · 报价有效期 {data.hours} 小时 ·
            后台不发起源站采集
          </p>
        </>
      )}
    </>
  );
}
export function AdminOperations({
  revision,
  resume,
}: {
  revision: unknown;
  resume: () => void;
}) {
  const [tab, setTab] = React.useState("coverage");
  return (
    <section
      className="admin-operations my-7 rounded-lg border border-border bg-card p-5 sm:p-6"
      aria-label="覆盖与采集工作台"
    >
      <div
        className="mb-6 flex flex-wrap gap-2"
        role="group"
        aria-label="工作台视图"
      >
        <Button
          variant={tab === "coverage" ? "default" : "outline"}
          onClick={() => setTab("coverage")}
          aria-pressed={tab === "coverage"}
        >
          覆盖缺口
        </Button>
        <Button
          variant={tab === "transfers" ? "default" : "outline"}
          onClick={() => setTab("transfers")}
          aria-pressed={tab === "transfers"}
        >
          采集与推送
        </Button>
      </div>
      {tab === "coverage" ? (
        <Coverage revision={revision} />
      ) : (
        <Transfers revision={revision} resume={resume} />
      )}
    </section>
  );
}

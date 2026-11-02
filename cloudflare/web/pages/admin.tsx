import { navigate } from "@/lib/navigation";
import { Link } from "@/components/link";
import type {
  AdminDashboardResponse,
  Lead,
  Shop,
} from "../../shared/api-types";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { api } from "@/lib/api";

import { PageSkeleton } from "@/components/page-loading";
import { pushBundle } from "../../shared/transfer-plan.mjs";

import { platformName, date } from "../lib/catalog-format";
import { AdminQuoteReports } from "../components/admin-quote-reports";
export function Admin() {
  const [d, setD] = React.useState<AdminDashboardResponse | null>(null);
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [pw, setPw] = React.useState("");
  const [err, setErr] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const load = () => {
    setErr("");
    void api<AdminDashboardResponse>("/api/admin/dashboard")
      .then(setD)
      .catch((e: any) => {
        if (e.status === 401) setD(null);
        else setErr(e.message);
      })
      .finally(() => setInitialLoading(false));
  };
  React.useEffect(() => {
    load();
  }, []);
  if (initialLoading)
    return <PageSkeleton variant="console" label="正在验证后台会话…" />;
  if (!d)
    return (
      <div className="max-w-lg py-12">
        <form
          className="space-y-5 rounded-lg border border-border bg-card p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr("");
            setBusy(true);
            try {
              await api("/api/admin/login", {
                method: "POST",
                body: JSON.stringify({ password: pw }),
              });
              setPw("");
              load();
            } catch (x: any) {
              setErr(x.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h1 className="text-2xl font-semibold">采集管理后台</h1>
          <label className="block text-sm font-medium">
            管理员密码
            <Input
              type="password"
              autoComplete="current-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="mt-2"
              required
            />
          </label>
          <Button disabled={busy}>{busy ? "登录中…" : "登录后台"}</Button>
          {err && (
            <p role="alert" className="text-sm text-destructive">
              {err}
            </p>
          )}
        </form>
      </div>
    );
  return (
    <div className="py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold tracking-[.2em] text-primary">
            COLLECTION CONSOLE
          </div>
          <h1 className="mt-2 text-4xl font-semibold">
            每一次更新，都有记录。
          </h1>
          <p className="mt-2 text-muted-foreground">
            {d.shops.length} 家店铺 · {d.pending.n} 件待审核商品
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load}>
            刷新状态
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/sponsors">广告与赞助</Link>
          </Button>
          <Button variant="outline" onClick={() => navigate("/admin/reviews")}>
            审核商品
          </Button>
          <Button disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? "正在导入…" : "导入本地结果"}
          </Button>
          <input
            ref={fileInput}
            hidden
            type="file"
            accept="application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const input = e.currentTarget;
              setBusy(true);
              try {
                if (file.size > 2 * 1024 * 1024)
                  throw new Error("导入文件超过2MB");
                const bundle = JSON.parse(await file.text());
                if (
                  bundle.schema_version !== 1 ||
                  !Array.isArray(bundle.shops) ||
                  !Array.isArray(bundle.quotes) ||
                  !Array.isArray(bundle.review_items) ||
                  !bundle.mapping_fingerprints
                )
                  throw new Error("采集包格式不正确");
                setStatus("正在导入本地采集结果…");
                const result = await pushBundle(
                  bundle,
                  (kind, payload) =>
                    api(
                      kind === "transfers"
                        ? "/api/admin/transfers"
                        : "/api/admin/ingest",
                      {
                        method: "POST",
                        body: JSON.stringify(payload),
                      },
                    ),
                  ({ done, total, resumed }) => {
                    setStatus(
                      `导入进度 ${done}/${total} 批${resumed ? `，已跳过此前完成的 ${resumed} 批` : ""}。原始核验时间保留。`,
                    );
                  },
                );
                setStatus(
                  `导入完成：${result.batches} 批，${result.quotes} 条报价。${result.resumed ? `跳过已完成 ${result.resumed} 批。` : ""}原始采集时间已保留。`,
                );
                load();
              } catch (x: any) {
                setStatus("导入未完成：" + x.message);
                load();
              } finally {
                input.value = "";
                setBusy(false);
              }
            }}
          />
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/api/admin/logout", { method: "POST" });
                setD(null);
                setPw("");
                setErr("");
              } catch (e: any) {
                setStatus(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            退出登录
          </Button>
        </div>
      </div>
      {err && (
        <p role="alert" className="my-4 text-sm text-destructive">
          {err}
        </p>
      )}
      <div className="my-7 border-l-4 border-primary bg-secondary px-5 py-3 text-sm leading-7">
        线上只接收本地 agent 的采集结果，不访问店铺源站。命令行运行{" "}
        <code>
          npm run sync:local → npm run collect:local → npm run push:local
        </code>
        。推送中断后使用原采集包重跑可继续。
      </div>
      {status && (
        <p role="status" className="my-4 break-words text-sm text-primary">
          {status}
        </p>
      )}
      <AdminQuoteReports />
      <React.Suspense
        fallback={<PageSkeleton variant="console" label="正在载入工作台…" />}
      >
        <AdminOperations
          revision={d}
          resume={() => {
            if (!busy) fileInput.current?.click();
          }}
        />
      </React.Suspense>
      <div className="two-col grid grid-cols-[1.3fr_1fr] gap-5">
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="font-semibold">报价有效期</h2>
          <form
            className="mt-4 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api("/api/admin/settings", {
                  method: "POST",
                  body: JSON.stringify({
                    auto_enabled: false,
                    interval_days: Number(f.get("days")),
                    freshness_hours: Number(f.get("hours")),
                  }),
                });
                setStatus("报价有效期已保存");
                load();
              } catch (x: any) {
                setStatus(x.message);
              }
            }}
          >
            <label className="block text-sm">
              本地 agent 建议采集间隔（天）
              <Input
                name="days"
                type="number"
                min="1"
                max="30"
                defaultValue={d.settings.interval_days}
                className="mt-2"
              />
            </label>
            <label className="block text-sm">
              报价有效期（小时）
              <Input
                name="hours"
                type="number"
                min="36"
                max="1440"
                defaultValue={d.settings.freshness_hours}
                className="mt-2"
              />
            </label>
            <p className="text-xs leading-6 text-muted-foreground">
              线上不会主动采集；设置仅用于报价过期判断。
            </p>
            <Button variant="outline">保存</Button>
          </form>
        </section>
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="font-semibold">候选店铺</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            当前待处理 {d.leads.length} 条。
          </p>
          <ul className="mt-4 max-h-64 space-y-4 overflow-y-auto">
            {d.leads.map((lead: Lead) => (
              <li key={lead.id} className="border-t border-border pt-3 text-sm">
                <Link
                  className="break-all text-primary hover:underline"
                  href={lead.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {lead.name} ↗
                </Link>
                {lead.note && (
                  <p className="mt-1 break-words text-muted-foreground">
                    {lead.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="mt-8 table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>店铺</th>
              <th>来源</th>
              <th>最近成功采集</th>
              <th>状态</th>
              <th>方式 / 操作</th>
            </tr>
          </thead>
          <tbody>
            {d.shops.map((s: Shop) => (
              <tr key={s.id}>
                <td className="font-semibold">{s.name}</td>
                <td>{platformName(s.platform)}</td>
                <td>{date(s.checked_at)}</td>
                <td>
                  {s.collection_paused
                    ? "待人工验证 · 暂停采集"
                    : s.enabled
                      ? s.collection_status === "ok"
                        ? "采集成功"
                        : "采集失败"
                      : s.disabled_at
                        ? "已失效 · 停止采集"
                        : "已暂停"}
                </td>
                <td>
                  <span className="text-primary">本地 agent 推送</span>
                  <Button
                    className="ml-3"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await api("/api/admin/shop", {
                          method: "POST",
                          body: JSON.stringify({
                            id: s.id,
                            enabled: !s.enabled,
                          }),
                        });
                        load();
                      } catch (e: any) {
                        setStatus(e.message);
                      }
                    }}
                  >
                    {s.enabled ? "暂停" : "启用"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const AdminOperations = React.lazy(() =>
  import("@/components/admin-operations").then((m) => ({
    default: m.AdminOperations,
  })),
);

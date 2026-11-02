import * as React from "react";
import { useApi } from "../lib/use-api";
import { api } from "../lib/api";
import { Link } from "./link";
import { Button } from "./ui/button";
import {
  reportReasons,
  type QuoteReport,
  type ReportSnapshot,
} from "../../shared/quote-report";
import { date, money } from "../lib/catalog-format";

export function AdminQuoteReports() {
  const [status, setStatus] = React.useState("pending");
  const [offset, setOffset] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const { data, error, loading, retry } = useApi<{ reports: QuoteReport[] }>(
    `/api/admin/quote-reports?status=${status}&offset=${offset}`,
  );
  const update = async (id: string, status: string) => {
    setBusy(true);
    setMessage("");
    try {
      await api("/api/admin/quote-reports", {
        method: "POST",
        body: JSON.stringify({ id, status }),
      });
      retry();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "处理失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="admin-quote-reports">
      <div className="section-caption">
        <h2>报价纠错反馈</h2>
        <span>核实后标记处理；不会自动更改报价</span>
      </div>
      <div className="report-admin-controls">
        <label>
          反馈状态{" "}
          <select
            aria-label="反馈状态"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="pending">待核实</option>
            <option value="resolved">已处理</option>
            <option value="dismissed">不采纳</option>
            <option value="all">全部</option>
          </select>
        </label>
        <Button variant="outline" size="sm" onClick={retry} disabled={loading}>
          刷新反馈
        </Button>
      </div>
      {(error || message) && (
        <p role="alert" className="text-destructive">
          {error || message}
        </p>
      )}
      {loading && <p role="status">正在读取反馈…</p>}
      {!loading && data?.reports.length === 0 && (
        <p className="text-muted-foreground">当前没有反馈。</p>
      )}
      {data?.reports.map((report) => {
        const q = JSON.parse(report.snapshot) as ReportSnapshot;
        return (
          <article className="report-admin-row" key={report.id}>
            <div>
              <strong>
                {reportReasons[report.reason]} · {q.shop_name}
              </strong>
              <p>
                <Link href={`/sku/${q.sku}`}>{q.item_name}</Link> · 反馈时记录 ¥
                {money(q.price)}
              </p>
              <p className="report-note">{report.note || "未填写补充说明"}</p>
              {q.item_url && (
                <p>
                  <Link
                    className="text-primary"
                    href={q.item_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看原始商品 ↗
                  </Link>
                </p>
              )}
              <small>
                采集 {date(q.checked_at)} · 反馈 {date(report.created_at)} ·{" "}
                {
                  {
                    pending: "待核实",
                    resolved: "已处理",
                    dismissed: "不采纳",
                  }[report.status]
                }
              </small>
            </div>
            <div className="report-admin-actions">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || loading}
                onClick={() => update(report.id, "resolved")}
              >
                标记已处理
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || loading}
                onClick={() =>
                  update(
                    report.id,
                    report.status === "pending" ? "dismissed" : "pending",
                  )
                }
              >
                {report.status === "pending" ? "不采纳" : "重新待核实"}
              </Button>
            </div>
          </article>
        );
      })}
      <div className="report-admin-controls">
        <Button
          variant="outline"
          size="sm"
          disabled={offset === 0 || loading}
          onClick={() => setOffset(Math.max(0, offset - 100))}
        >
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={data?.reports.length !== 100 || loading}
          onClick={() => setOffset(offset + 100)}
        >
          下一页
        </Button>
      </div>
    </section>
  );
}

import * as React from "react";
import { Dialog } from "radix-ui";
import { Flag, X } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { api } from "../lib/api";
import type { Quote } from "../../shared/api-types";
import { reportReasons, type ReportReason } from "../../shared/quote-report";

export function QuoteReportButton({ quote }: { quote: Quote }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<ReportReason>("price");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const reasonId = React.useId(),
    noteId = React.useId();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setSent(false);
          setError("");
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="quote-report-trigger"
          aria-label={`反馈${quote.shop_name || quote.shop_id}的${quote.item_name}报价问题`}
        >
          <Flag size={13} aria-hidden="true" />
          反馈问题
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="feedback-overlay" />
        <Dialog.Content className="feedback-dialog">
          <Dialog.Title>报价纠错</Dialog.Title>
          <Dialog.Description>
            {quote.shop_name || quote.shop_id} · {quote.item_name}
          </Dialog.Description>
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="icon"
              className="feedback-close"
              aria-label="关闭报价纠错"
            >
              <X size={18} />
            </Button>
          </Dialog.Close>
          {sent ? (
            <div className="feedback-success" role="status">
              <strong>反馈已收到，等待核实</strong>
              <p>反馈不会直接改变报价，核实后再更新。</p>
              <Dialog.Close asChild>
                <Button>完成</Button>
              </Dialog.Close>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await api("/api/quote-reports", {
                    method: "POST",
                    body: JSON.stringify({ quote_id: quote.id, reason, note }),
                  });
                  setSent(true);
                  setNote("");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "提交失败，请重试");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label htmlFor={reasonId}>问题类型</label>
              <select
                id={reasonId}
                value={reason}
                onChange={(e) => setReason(e.target.value as ReportReason)}
              >
                {Object.entries(reportReasons).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <label htmlFor={noteId}>
                补充说明{reason === "other" ? "（必填）" : "（可选）"}
              </label>
              <Textarea
                id={noteId}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                required={reason === "other"}
                placeholder="例如原店当前显示的价格、缺货情况或规格差异"
                rows={4}
              />
              <small>会附上这条报价的来源和采集记录，无需填写联系方式。</small>
              {error && (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              )}
              <Button disabled={busy} type="submit">
                {busy ? "提交中…" : "提交反馈"}
              </Button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

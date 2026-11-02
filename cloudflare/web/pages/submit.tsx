import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { api } from "@/lib/api";

export function Submit() {
  const [ok, setOk] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  return (
    <div className="max-w-2xl py-12">
      <div className="text-xs font-semibold tracking-[.2em] text-primary">
        GROW THE DIRECTORY TOGETHER
      </div>
      <h1 className="mt-3 text-4xl font-semibold">保存一条有用的线索。</h1>
      <p className="mt-2 text-muted-foreground">
        提交后进入候选列表，核验店铺状态和商品规格后加入采集。
      </p>
      <form
        className="mt-8 space-y-5 rounded-lg border border-border bg-card p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          setOk(false);
          const form = e.currentTarget;
          const f = new FormData(form);
          try {
            await api("/api/leads", {
              method: "POST",
              body: JSON.stringify(Object.fromEntries(f)),
            });
            setOk(true);
            form.reset();
          } catch (x: any) {
            setErr(x.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block text-sm font-medium">
          店铺名称
          <Input name="name" required maxLength={80} className="mt-2" />
        </label>
        <label className="block text-sm font-medium">
          店铺网址
          <Input
            name="url"
            type="url"
            required
            placeholder="https://"
            className="mt-2"
          />
        </label>
        <label className="block text-sm font-medium">
          补充说明
          <Textarea name="note" maxLength={1000} className="mt-2" />
        </label>
        <Button disabled={busy}>{busy ? "提交中…" : "提交店铺线索"}</Button>
        {ok && (
          <p className="text-sm text-primary">已保存到后台候选，等待审核。</p>
        )}
        {err && (
          <p role="alert" className="text-sm text-destructive">
            {err}
          </p>
        )}
      </form>
    </div>
  );
}

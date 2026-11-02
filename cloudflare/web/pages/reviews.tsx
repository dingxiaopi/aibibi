import { Link } from "@/components/link";
import type { ReviewRecord, ReviewsResponse } from "../../shared/api-types";
import * as React from "react";

import { Button } from "@/components/ui/button";

import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";

import { PageSkeleton, LoadingStatus } from "@/components/page-loading";

export function Reviews() {
  const target = new URLSearchParams(location.search).get("id") || "";
  const [offset, setOffset] = React.useState(0);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const changePage = (next: number) => {
    setOffset(next);
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  };
  const {
    data,
    error,
    loading,
    retry: load,
  } = useApi<ReviewsResponse>(
    `/api/admin/reviews?offset=${offset}${target ? `&id=${encodeURIComponent(target)}` : ""}`,
  );
  const items: ReviewRecord[] = data?.items || [];
  return (
    <div className="py-10">
      <Link
        href="/admin"
        className="text-sm text-muted-foreground hover:text-primary"
      >
        ← 管理后台
      </Link>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 text-3xl font-semibold"
      >
        先看清规格，再加入比价。
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
        本地采集模式下，商品详情审核和重新采集需要由本地 agent
        完成；线上仅能排除商品或导入已审核报价。
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {loading && !data && (
        <PageSkeleton variant="table" label="正在读取待审商品…" />
      )}
      {loading && data && <LoadingStatus>正在更新待审记录…</LoadingStatus>}
      {!loading && !items.length && !error && (
        <p className="my-8 text-sm text-muted-foreground">
          本页暂无待审核商品。
        </p>
      )}
      {error && (
        <div className="flex gap-3">
          <Button variant="outline" onClick={load}>
            重试
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin">前往后台登录</Link>
          </Button>
        </div>
      )}
      {target && (
        <p className="my-4 text-sm text-muted-foreground">
          当前定位到指定待审商品。
          <Link className="ml-2 text-primary" href="/admin/reviews">
            查看全部待审商品 ↗
          </Link>
        </p>
      )}
      {items.map((g) => (
        <ReviewItem key={g.id} item={g} onDone={load} />
      ))}
      <div className="mt-6 flex items-center gap-4">
        <Button
          variant="outline"
          disabled={loading || !offset}
          onClick={() => changePage(Math.max(0, offset - 25))}
        >
          上一页
        </Button>
        <span className="text-sm text-muted-foreground">
          第 {Math.floor(offset / 25) + 1} 页
        </span>
        <Button
          variant="outline"
          disabled={loading || items.length < 25}
          onClick={() => changePage(offset + 25)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

export function ReviewItem({
  item,
  onDone,
}: {
  item: ReviewRecord;
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(item.raw || "{}");
  } catch {}
  return (
    <section className="my-5 rounded-lg border border-border bg-card p-5">
      <h2 className="font-semibold">{item.title}</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        {item.shop_name} · {item.source_id} · {item.reason}
      </p>
      <details className="my-3 text-sm">
        <summary className="cursor-pointer text-primary">展开商品说明</summary>
        <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-muted-foreground">
          {String(raw.description || "尚无详情").replace(/<[^>]*>/g, " ")}
        </pre>
      </details>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          由本地 agent 审核规格后推送
        </span>
        <Button
          variant="destructive"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/api/admin/review", {
                method: "POST",
                body: JSON.stringify({ id: item.id, action: "reject" }),
              });
              onDone();
            } catch (e: any) {
              setMessage(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          排除出比价
        </Button>
      </div>
      {message && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {message}
        </p>
      )}
    </section>
  );
}

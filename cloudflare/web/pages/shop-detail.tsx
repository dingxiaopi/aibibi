import { SITE_NAME } from "../../shared/site";
import { Link } from "@/components/link";
import type { ShopDetailResponse } from "../../shared/api-types";
import { useApi } from "@/lib/use-api";

import {
  PageSkeleton,
  RowSkeletons,
  LoadingStatus,
} from "@/components/page-loading";

import { useCatalog } from "../lib/catalog-context";
import { RequestError } from "../components/request-error";
import { platformName, date } from "../lib/catalog-format";
import { QuoteList } from "../components/quote-list";
import { STALE_SHOP_DAYS } from "../../shared/shop-visibility";
import { FavoriteButton } from "../components/favorite-button";
export function ShopDetail({ id }: { id: string }) {
  const { shops } = useCatalog();
  const {
    data: loaded,
    error,
    retry,
    loading,
  } = useApi<ShopDetailResponse>(`/api/shops/${encodeURIComponent(id)}`);
  const knownShop = loaded?.shop || shops.find((shop) => shop.id === id);
  const d: ShopDetailResponse | null =
    loaded || (knownShop ? { shop: knownShop, quotes: [], hours: 48 } : null);
  const pending = !loaded;
  const records = d?.recorded_quotes ?? d?.quotes ?? [];
  const sourceItemCount =
    Number.isSafeInteger(d?.shop.source_item_count) &&
    Number(d?.shop.source_item_count) >= 0
      ? d!.shop.source_item_count
      : null;
  if (error && !d) return <RequestError message={error} retry={retry} />;
  if (!d) return <PageSkeleton variant="table" label="正在读取店铺报价…" />;
  return (
    <>
      {error && <RequestError message={error} retry={retry} />}
      <div className="catalog-breadcrumb">
        <Link href="/">{SITE_NAME}</Link>
        <span>/</span>
        <Link href="/shops">店铺目录</Link>
        <span>/</span>
        {d.shop.name}
      </div>
      <div className="catalog-store-intro">
        <Link
          className="text-xs text-muted-foreground hover:text-primary"
          href="/shops"
        >
          店铺目录
        </Link>

        <h1 className="mt-2 text-4xl font-semibold">{d.shop.name}</h1>
        <div className="mt-3">
          <FavoriteButton kind="shops" id={id} name={d.shop.name} />
        </div>
        <p className="mt-2 text-muted-foreground">
          {platformName(d.shop.platform)} · 最近成功采集{" "}
          {date(d.shop.checked_at)}
        </p>
        {sourceItemCount != null && (
          <p className="mt-2 text-sm text-muted-foreground">
            最近一次采集记录：{sourceItemCount} 件源商品
            {!pending && ` · 已审核 ${records.length} 件 · 当前可比价 ${d.quotes.length} 条`}
          </p>
        )}
        {d.shop.url && (
          <Link
            className="mt-4 inline-flex text-sm text-primary hover:underline"
            href={d.shop.url}
            target="_blank"
            rel="noreferrer"
          >
            访问原始店铺 ↗
          </Link>
        )}
      </div>
      <div className="data-notice">
        {d.shop.disabled_at
          ? `已确认失效，停止后续采集：${d.shop.disabled_reason}`
          : d.shop.collection_paused
            ? d.shop.pause_reason
            : d.shop.collection_status === "ok"
              ? "最近一次目录核验成功"
              : "本次未能完成目录核验，等待重试"}
        。店铺成功采集不代表所有商品已审核。
        已审核但库存未知、售罄或兑换受限的商品保留为采集记录，不参与当前最低价。
        {!d.shop.enabled && "该店铺已暂停，报价不参与最低可用价。"}
        {d.shop.enabled &&
          d.shop.listed === false &&
          `已连续 ${STALE_SHOP_DAYS} 天以上采集失败，暂不列入店铺目录。`}
      </div>
      <div className="section-caption">
        <h2>已审核商品记录</h2>
        <span>
          {pending ? "读取中" : `${records.length} 件 · 可比价 ${d.quotes.length} 条`} · 逐项查看核验依据
        </span>
      </div>
      <div className="query-status-slot">
        {loading && (
          <LoadingStatus>
            {pending ? "正在读取店铺报价…" : "正在更新店铺报价…"}
          </LoadingStatus>
        )}
      </div>
      <div className="quote-results" aria-busy={loading}>
        {pending ? (
          loading && <RowSkeletons count={5} />
        ) : !records.length ? (
          <div className="catalog-no-results">
            <p>
              {sourceItemCount != null && sourceItemCount > 0
                ? `最近一次采集记录中有 ${sourceItemCount} 件源商品，当前暂无有效期内的已审核商品记录。`
                : "当前暂无有效期内的已审核商品记录。"}
            </p>
            <p className="mt-2 text-sm">
              尚未分类或关键规格变化的商品需另行核验；过期、下架或本次采集失败的记录暂不展示。
            </p>
            {d.shop.url && (
              <Link
                className="mt-3 inline-flex text-sm text-primary hover:underline"
                href={d.shop.url}
                target="_blank"
                rel="noreferrer"
              >
                前往原店查看在售商品 ↗
              </Link>
            )}
          </div>
        ) : (
          <QuoteList quotes={records} hours={d.hours} />
        )}
      </div>
    </>
  );
}

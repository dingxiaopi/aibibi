import { SITE_NAME } from "../../shared/site";
import { Link } from "@/components/link";
import type {
  CatalogProduct,
  Quote,
  ProductDetailResponse,
} from "../../shared/api-types";
import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useApi } from "@/lib/use-api";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PageSkeleton,
  RowSkeletons,
  LoadingStatus,
} from "@/components/page-loading";

import { BrandIcon, brandLabel } from "@/components/brand-icon";

import { useCatalog } from "../lib/catalog-context";
import { available, money } from "../lib/catalog-format";
import { RequestError } from "../components/request-error";

const OfficialCompare = React.lazy(
  () => import("../components/official-compare"),
);
import {
  CatalogSidebar,
  CatalogVariants,
} from "../components/catalog-navigation";
import { QuoteList } from "../components/quote-list";
import { History } from "./history";
import { RelatedProducts } from "../components/related-products";
import { FavoriteButton } from "../components/favorite-button";
export function Detail({ id }: { id: string }) {
  const [ready, setReady] = React.useState(false);
  const [platform, setPlatform] = React.useState("all");
  const [sort, setSort] = React.useState("ready");
  const { catalog } = useCatalog();
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const {
    data: loaded,
    error,
    loading,
    retry,
  } = useApi<ProductDetailResponse>(`/api/products/${encodeURIComponent(id)}`);
  const knownProduct =
    loaded?.product ||
    catalog.data?.products.find((p: CatalogProduct) => p.id === id);
  const source =
    loaded ||
    (knownProduct
      ? {
          product: knownProduct,
          quotes: [],
          hours: catalog.data?.settings.freshness_hours || 48,
        }
      : null);
  const d = source
    ? {
        ...source,
        quotes: source.quotes
          .filter(
            (q: Quote) =>
              (platform === "all" || q.platform === platform) &&
              (!ready || available(q, source.hours)),
          )
          .sort((a: Quote, b: Quote) =>
            sort === "high"
              ? Number(b.price) - Number(a.price)
              : sort === "low"
                ? Number(a.price) - Number(b.price)
                : Number(available(b, source.hours)) -
                    Number(available(a, source.hours)) ||
                  Number(a.price) - Number(b.price),
          ),
      }
    : null;
  if (!d)
    return error ? (
      <RequestError message={error} retry={retry} />
    ) : (
      <PageSkeleton variant="detail" label="正在读取规格与报价…" />
    );
  const pending = !loaded;
  const readyQuotes = d.quotes.filter((quote: Quote) =>
    available(quote, d.hours),
  );
  const minimum = readyQuotes.length
    ? Math.min(...readyQuotes.map((quote: Quote) => quote.price))
    : null;
  return (
    <>
      <div className="catalog-breadcrumb">
        <Link href="/">{SITE_NAME}</Link>
        <span>/</span>
        <Link href={`/c/${d.product.category}`}>
          {brandLabel(d.product.category)}
        </Link>
        <span>/</span>
        {d.product.name}
      </div>
      <div className="catalog-layout">
        <CatalogSidebar category={d.product.category} current={id} />
        <div className="catalog-content">
          <div className="catalog-detail-intro">
            <h1 className="detail-title">
              <span className={`brand-tile brand-${d.product.category}`}>
                <BrandIcon
                  category={d.product.brand || d.product.category}
                  size={36}
                />
              </span>
              {d.product.category === "gpt" ? "ChatGPT · " : ""}
              {d.product.name}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {d.product.spec} · {d.product.channel}
            </p>
            <div className="mt-3">
              <FavoriteButton kind="products" id={id} name={d.product.name} />
            </div>
            <CatalogVariants product={d.product} />
            <div
              className="detail-facts"
              aria-label="当前筛选报价概览"
              aria-busy={loading}
            >
              <div>
                <span>最低可用货架价</span>
                {pending ? (
                  <Skeleton className="h-8 w-24 my-2" />
                ) : (
                  <strong>
                    {minimum === null ? "暂无" : `¥${money(minimum)}`}
                  </strong>
                )}
                <small>当前筛选 · 手续费另核</small>
              </div>
              <div>
                <span>可用报价</span>
                {pending ? (
                  <Skeleton className="h-8 w-16 my-2" />
                ) : (
                  <strong>
                    {readyQuotes.length}
                    <em> 条</em>
                  </strong>
                )}
                <small>有效期内有货且未受限</small>
              </div>
              <div>
                <span>来源平台</span>
                {pending ? (
                  <Skeleton className="h-8 w-16 my-2" />
                ) : (
                  <strong>
                    {
                      new Set(readyQuotes.map((quote: Quote) => quote.platform))
                        .size
                    }
                    <em> 个</em>
                  </strong>
                )}
                <small>可用报价覆盖 · 非信誉评级</small>
              </div>
            </div>
          </div>
          <React.Suspense fallback={null}>
            <OfficialCompare sku={id} minimum={minimum} />
          </React.Suspense>
          <div className="catalog-data-note">
            比较的是单件货架价，手续费及最终结算金额未核验。库存不是实时库存，售后与充值渠道均为商家声明。
          </div>
          <div className="quote-toolbar">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={ready}
                onCheckedChange={(v) => setReady(v === true)}
              />
              仅展示有效、有货且未受限报价
            </label>
            <span className="text-sm text-muted-foreground">平台</span>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger aria-label="来源平台" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部平台</SelectItem>
                <SelectItem value="16688">16688</SelectItem>
                <SelectItem value="wzyp">链动店铺</SelectItem>
                <SelectItem value="catfk">Catfk</SelectItem>
                <SelectItem value="acg">独立发卡站</SelectItem>
                <SelectItem value="independent">NikoCard</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">排序</span>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger aria-label="报价排序" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ready">可用优先</SelectItem>
                <SelectItem value="low">价格升序</SelectItem>
                <SelectItem value="high">价格降序</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="query-status-slot">
            {loading && (
              <LoadingStatus>
                {pending ? "正在读取当前规格报价…" : "正在更新报价…"}
              </LoadingStatus>
            )}
          </div>
          {error && <RequestError message={error} retry={retry} />}
          <div className="section-caption">
            <h2>有效报价</h2>
            <span>
              {pending ? "读取中" : `${d.quotes.length} 条`} · 单件货架价
            </span>
          </div>
          <div className="quote-results" aria-busy={loading}>
            {pending ? (
              <RowSkeletons count={6} />
            ) : (
              <QuoteList quotes={d.quotes} hours={d.hours} />
            )}
          </div>
          <details
            className="history-panel"
            onToggle={(e) => setHistoryOpen(e.currentTarget.open)}
          >
            <summary className="font-semibold">查看实际观察历史</summary>
            <p className="mt-2 text-sm text-muted-foreground">
              只记录实际采集值。同一商品的变化与不同来源的低价不能混为一谈。
            </p>
            {historyOpen && <History key={id} id={id} />}
          </details>
          <RelatedProducts
            category={d.product.category}
            current={id}
            family={d.product.family}
          />
        </div>
      </div>
    </>
  );
}

import { SITE_NAME } from "../../shared/site";
import { Link } from "@/components/link";
import type { CatalogProduct, ProductsResponse } from "../../shared/api-types";
import { ArrowRight, Store } from "lucide-react";

import { useApi } from "@/lib/use-api";

import { RowSkeletons, LoadingStatus } from "@/components/page-loading";

import { useCatalog } from "../lib/catalog-context";
import { platformName } from "../lib/catalog-format";
import { RequestError } from "../components/request-error";
import { ProductRow } from "../components/product-row";
export function SearchPage({ query }: { query: string }) {
  const { shops, shopError, retryShops, shopLoading } = useCatalog();
  const { data, error, retry, loading } = useApi<ProductsResponse>(
    `/api/products?q=${encodeURIComponent(query)}`,
  );
  const matched = shops.filter((shop) =>
    (shop.name + platformName(shop.platform))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="catalog-search-page">
      <div className="catalog-breadcrumb">
        <Link href="/">{SITE_NAME}</Link>
        <span>/</span>搜索
      </div>
      <h1>搜索“{query}”</h1>
      <section
        className="catalog-brand-panel"
        aria-busy={loading}
        aria-label="商品搜索结果"
      >
        <header>
          <h2>商品规格</h2>
          <span>
            {data
              ? `${data.products.length} 种`
              : loading
                ? "读取中"
                : "暂不可用"}
          </span>
        </header>
        {error && <RequestError message={error} retry={retry} />}
        <div className="query-status-slot">
          {loading && (
            <LoadingStatus>
              {data ? "正在更新商品结果…" : "正在搜索商品规格…"}
            </LoadingStatus>
          )}
        </div>
        {!data && loading ? (
          <RowSkeletons count={4} />
        ) : (
          data?.products.map((p: CatalogProduct) => (
            <ProductRow key={p.id} p={p} />
          ))
        )}
        {data && !data.products.length && (
          <p className="catalog-no-results">
            没有匹配的商品规格，可以试试品牌或套餐名称。
          </p>
        )}
      </section>
      <section
        className="catalog-search-shops"
        aria-busy={shopLoading}
        aria-label="店铺搜索结果"
      >
        <h2 className="catalog-search-shop-title">
          店铺 ·{" "}
          {shopError && !shops.length
            ? "暂不可用"
            : shopLoading && !shops.length
              ? "读取中"
              : `${matched.length} 家`}
        </h2>
        {shopError && <RequestError message={shopError} retry={retryShops} />}
        {shopLoading && !shops.length ? (
          <>
            <LoadingStatus>正在搜索店铺…</LoadingStatus>
            <RowSkeletons count={2} />
          </>
        ) : (
          <>
            <div className="catalog-shop-results">
              {matched.map((shop) => (
                <Link key={shop.id} href={`/shops/${shop.id}`}>
                  <Store size={19} />
                  <div>
                    <strong title={shop.name}>{shop.name}</strong>
                    <small>{platformName(shop.platform)}</small>
                  </div>
                  <ArrowRight size={14} />
                </Link>
              ))}
            </div>
            {!matched.length && !shopError && (
              <p className="catalog-no-results">
                没有匹配的店铺。
                <Link href="/shops" className="text-primary hover:underline">
                  查看全部店铺 ↗
                </Link>
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

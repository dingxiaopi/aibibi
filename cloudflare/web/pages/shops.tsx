import { SITE_NAME } from "../../shared/site";
import { Link } from "@/components/link";
import type { Shop, ShopsResponse } from "../../shared/api-types";
import * as React from "react";

import { ArrowRight, Search, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useApi } from "@/lib/use-api";

import { PageSkeleton } from "@/components/page-loading";

import { useSessionValue } from "../lib/session";
import { RequestError } from "../components/request-error";
import { platformName, date } from "../lib/catalog-format";
import { STALE_SHOP_DAYS } from "../../shared/shop-visibility";
import { Checkbox } from "../components/ui/checkbox";
import { FavoriteButton } from "../components/favorite-button";
import { useFavorites } from "../lib/favorites";
import { filterShops } from "../lib/shop-directory";
import { categories } from "../lib/catalog-format";
export function Shops() {
  const { data: d, error, retry } = useApi<ShopsResponse>("/api/shops");
  const [q, setQ] = useSessionValue("youshu-shop-search", "");
  const [platform, setPlatform] = useSessionValue("bijia-shop-platform", "all");
  const [category, setCategory] = useSessionValue("bijia-shop-category", "all");
  const [sort, setSort] = useSessionValue("bijia-shop-sort", "quotes");
  const [ready, setReady] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const { favorites } = useFavorites();
  if (error && !d) return <RequestError message={error} retry={retry} />;
  if (!d) return <PageSkeleton variant="shops" label="正在读取店铺目录…" />;
  const listed = d.shops.filter((shop) => shop.listed);
  const shops = filterShops(d.shops, {
    q,
    platform,
    category,
    ready,
    saved,
    favorites: favorites.shops,
    sort,
  });
  const clear = () => {
    setQ("");
    setPlatform("all");
    setCategory("all");
    setSort("quotes");
    setReady(false);
    setSaved(false);
  };
  const hidden = d.shops.length - listed.length;
  return (
    <>
      {error && <RequestError message={error} retry={retry} />}
      <div className="catalog-breadcrumb">
        <Link href="/">{SITE_NAME}</Link>
        <span>/</span>全部店铺
      </div>
      <div className="catalog-page-title">
        <h1>AI 订阅店铺目录</h1>
        <p>
          收录 {listed.length}{" "}
          家店铺，查看平台、采集状态和已核验报价。收录不代表信誉背书。
          {hidden > 0 &&
            ` 另有 ${hidden} 家已停用或连续 ${STALE_SHOP_DAYS} 天采集失败，暂不列出。`}
        </p>
      </div>
      <div className="catalog-directory-filters">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="搜索店铺或平台"
            aria-label="搜索店铺或平台"
          />
        </div>
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger aria-label="筛选店铺平台">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部平台</SelectItem>
            <SelectItem value="16688">16688</SelectItem>
            <SelectItem value="wzyp">链动店铺</SelectItem>
            <SelectItem value="catfk">Catfk</SelectItem>
            <SelectItem value="acg">独立发卡站</SelectItem>
            <SelectItem value="independent">NikoCard（目录）</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger aria-label="筛选店铺品牌">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map(([id, label]) => (
              <SelectItem key={id} value={id}>
                {id === "all" ? "全部品牌" : label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger aria-label="店铺排序">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="quotes">有效报价最多</SelectItem>
            <SelectItem value="updated">最近成功采集</SelectItem>
            <SelectItem value="name">店铺名称</SelectItem>
          </SelectContent>
        </Select>
        <span>{shops.length} 家店铺</span>
      </div>
      <div className="shop-filter-options">
        <label>
          <Checkbox
            checked={ready}
            aria-label="只看有可比价报价"
            onCheckedChange={(v) => setReady(v === true)}
          />
          只看有可比价报价
        </label>
        <label>
          <Checkbox
            checked={saved}
            aria-label="只看已收藏"
            onCheckedChange={(v) => setSaved(v === true)}
          />
          只看已收藏
        </label>
        <Button variant="ghost" size="sm" onClick={clear}>
          重置筛选
        </Button>
        <small>品牌依据当前有效报价，未审核商品不计入。</small>
      </div>
      <div className="catalog-shop-directory">
        {shops.map((shop: Shop) => (
          <article className="catalog-directory-item" key={shop.id}>
            <Link className="catalog-directory-row" href={`/shops/${shop.id}`}>
              <span className="catalog-store-avatar">
                {shop.name.slice(0, 1)}
              </span>
              <div>
                <h2 title={shop.name}>{shop.name}</h2>
                <p>
                  {platformName(shop.platform)} ·{" "}
                  {shop.collection_paused
                    ? "待人工验证 · 暂停采集"
                    : shop.active_quotes
                      ? `${shop.active_quotes} 条可比价报价`
                      : "暂无可比价报价"}
                </p>
                <small>
                  {shop.collection_status === "ok"
                    ? "最近成功采集"
                    : shop.collection_paused
                      ? shop.pause_reason
                      : "最近采集失败，上次成功"}{" "}
                  · {date(shop.checked_at)}
                </small>
                {!!shop.categories?.length && (
                  <span className="shop-brand-tags">
                    {shop.categories
                      .map((id) => categories.find(([key]) => key === id)?.[1])
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </div>
              <ArrowRight size={16} />
            </Link>
            <FavoriteButton
              compact
              kind="shops"
              id={shop.id}
              name={shop.name}
            />
          </article>
        ))}
      </div>
      {!shops.length && (
        <div className="empty-results">
          <Store size={24} />
          <h2>没有匹配的店铺</h2>
          <Button variant="outline" onClick={clear}>
            清空筛选
          </Button>
        </div>
      )}
    </>
  );
}

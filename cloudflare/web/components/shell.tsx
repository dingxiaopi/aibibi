import { SITE_NAME, SITE_TAGLINE, SITE_LOGO, DEMO_MODE } from "../../shared/site";
import { navigate } from "@/lib/navigation";
import { Link } from "@/components/link";
import type { CatalogProduct } from "../../shared/api-types";
import * as React from "react";

import {
  ArrowRight,
  Globe2,
  Moon,
  Search,
  Star,
  Store,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { BrandIcon } from "@/components/brand-icon";

import { useCatalog } from "../lib/catalog-context";
import { categories, date } from "../lib/catalog-format";
export function Shell({
  children,
  path,
  dark,
  onTheme,
}: {
  children: React.ReactNode;
  path: string;
  dark: boolean;
  onTheme: () => void;
}) {
  const { catalog, shops, shopLoading } = useCatalog();
  const products: CatalogProduct[] = catalog.data?.products || [];
  const active = path.startsWith("/c/")
    ? path.slice(3)
    : path.startsWith("/sku/")
      ? products.find((p) => p.id === path.slice(5))?.category
      : path.startsWith("/official")
        ? "official"
        : path === "/shops" || path.startsWith("/shops/")
          ? "shops"
          : path === "/favorites"
            ? "favorites"
            : "all";
  const dates = shops
    .map((s) => s.checked_at)
    .filter(
      (v): v is string =>
        typeof v === "string" && Number.isFinite(Date.parse(v)),
    );
  const latest = dates.length
    ? dates.reduce((a, b) => (Date.parse(a) > Date.parse(b) ? a : b))
    : null;
  return (
    <>
      {DEMO_MODE && <div role="status" className="demo-notice">演示模式：店铺、报价和库存均为虚构示例，请勿用于购买决策。</div>}
      <header className="page-shell catalog-header">
        <Link href="/" className="catalog-logo">
          <img
            className="brand-mark"
            src={SITE_LOGO}
            width={100}
            height={64}
            alt=""
          />
          <div>
            <b className="brand-wordmark">{SITE_NAME}</b>
            <small>{SITE_TAGLINE}</small>
          </div>
        </Link>
        <CatalogHeaderSearch />
        <Button
          variant="ghost"
          size="icon"
          aria-label="切换明暗主题"
          onClick={onTheme}
        >
          {dark ? <Sun /> : <Moon />}
        </Button>
      </header>
      <div className="catalog-nav-wrap">
        {((catalog.loading && catalog.data) ||
          (shopLoading && shops.length > 0)) && (
          <div
            className="query-route-progress"
            role="progressbar"
            aria-label="正在更新目录数据"
          />
        )}
        <div className="page-shell catalog-nav-row">
          <nav aria-label="主导航">
            <Link href="/" aria-current={active === "all" ? "page" : undefined}>
              全部商品
            </Link>
            <Link
              href="/shops"
              aria-current={active === "shops" ? "page" : undefined}
            >
              <Store size={17} aria-hidden="true" />
              <span>全部店铺</span>
            </Link>
            <Link
              href="/favorites"
              aria-current={active === "favorites" ? "page" : undefined}
            >
              <Star size={17} aria-hidden="true" />
              <span>收藏夹</span>
            </Link>
            {categories
              .filter(([id]) => id !== "all")
              .map(([id, label]) => (
                <Link
                  key={id}
                  href={`/c/${id}`}
                  aria-current={active === id ? "page" : undefined}
                >
                  <BrandIcon category={id} size={17} />
                  <span>{label}</span>
                </Link>
              ))}
            <Link
              href="/official"
              aria-current={active === "official" ? "page" : undefined}
            >
              <Globe2 size={17} aria-hidden="true" />
              <span>官方价格</span>
            </Link>
          </nav>
          <div className="catalog-meta" aria-label="收录规模与采集时间">
            <Link href="/shops" className="catalog-shop-count">
              {catalog.data?.stats.shops ?? "—"} 家店铺
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
            <span>{catalog.data ? products.length : "—"} 种规格</span>
            <small>
              {latest ? `最近成功采集 ${date(latest)}` : "等待读取采集记录"}
            </small>
          </div>
        </div>
      </div>
      <main className="page-shell catalog-main">
        {catalog.error && catalog.data && (
          <div className="background-read-error" role="status">
            <span>目录更新失败，当前显示上次查询结果。</span>
            <Button variant="ghost" size="sm" onClick={catalog.retry}>
              重试
            </Button>
          </div>
        )}
        <div className="route-content">{children}</div>
      </main>
      <footer className="page-shell catalog-footer">
        <nav className="catalog-footer-directory" aria-label="商品规格目录">
          {categories
            .filter(
              ([id]) => id !== "all" && products.some((p) => p.category === id),
            )
            .map(([id, label]) => (
              <section key={id}>
                <Link href={`/c/${id}`}>
                  <b>{label}</b>
                  <span>
                    {products.filter((p) => p.category === id).length} 种
                  </span>
                </Link>
                {products
                  .filter((p) => p.category === id)
                  .slice(0, 4)
                  .map((p) => (
                    <Link href={`/sku/${p.id}`} key={p.id}>
                      {p.name}
                    </Link>
                  ))}
              </section>
            ))}
        </nav>
        <div className="catalog-footer-bottom">
          <Link href="/" className="footer-brand">
            <img src={SITE_LOGO} width={100} height={64} alt="" />
            <span className="brand-wordmark">{SITE_NAME}</span>
          </Link>
          <nav aria-label="网站导航">
            <Link href="/official">官方价格</Link>
            <Link href="/shops">全部店铺</Link>
            <Link href="/favorites">收藏夹</Link>
            <Link href="/submit">提交店铺</Link>
            <Link href="/about">数据说明</Link>
            <Link href="/admin">管理后台</Link>
          </nav>
        </div>
        <p>
          数据来自原店公开渠道，仅供价格观察。库存为采集时记录，货架价不含未核验手续费；购买前请在源站核对商品、库存与售后。
        </p>
      </footer>
    </>
  );
}

export function CatalogHeaderSearch() {
  const { catalog, shops } = useCatalog();
  const [q, setQ] = React.useState("");
  const [expanded, setExpanded] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !target.closest("input,textarea,select,[contenteditable=true]")
      ) {
        event.preventDefault();
        setExpanded(true);
        requestAnimationFrame(() => input.current?.focus());
      }
    };
    addEventListener("keydown", shortcut);
    return () => removeEventListener("keydown", shortcut);
  }, []);
  return (
    <>
      <Button
        className="catalog-mobile-search-toggle"
        type="button"
        variant="ghost"
        size="icon"
        aria-label="展开搜索"
        onClick={() => {
          setExpanded((v) => !v);
          requestAnimationFrame(() => input.current?.focus());
        }}
      >
        <Search size={18} />
      </Button>
      <form
        className={`catalog-search${expanded ? " is-expanded" : ""}`}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Search size={16} aria-hidden="true" />
        <Input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") input.current?.blur();
          }}
          placeholder="搜商品或店铺"
          aria-label="搜商品或店铺"
          list="catalog-search-options"
          autoComplete="off"
        />
        <datalist id="catalog-search-options">
          {catalog.data?.products.map((p: CatalogProduct) => (
            <option value={p.name} key={p.id} />
          ))}
          {shops.map((s) => (
            <option value={s.name} key={s.id} />
          ))}
        </datalist>
        <Button type="submit" variant="ghost" size="icon" aria-label="搜索">
          <ArrowRight size={15} />
        </Button>
        <kbd>/</kbd>
      </form>
    </>
  );
}

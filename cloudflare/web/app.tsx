import { readRoute, routePath } from "./lib/navigation";
import { updatePageMeta } from "./lib/page-meta";
import { Link } from "@/components/link";
import type { ProductsResponse, ShopsResponse } from "../shared/api-types";
import type { CatalogProduct } from "../shared/api-types";
import * as React from "react";

import { useApi } from "@/lib/use-api";

import { categories } from "./lib/catalog-format";
import { Home } from "./pages/home";
import { CategoryPage } from "./pages/category";
import { SearchPage } from "./pages/search";
import { Detail } from "./pages/detail";
import { Shops } from "./pages/shops";
import { ShopDetail } from "./pages/shop-detail";
import { About } from "./pages/about";
import { Submit } from "./pages/submit";
import { CatalogContext } from "./lib/catalog-context";
import { Shell } from "./components/shell";
import { Loading } from "./components/loading";
import { UmamiAnalytics } from "./components/umami";
import { FavoritesPage } from "./pages/favorites";
export function App() {
  React.useEffect(() => {
    const update = () => {
      document.documentElement.dataset.background = String(document.hidden);
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const [route, setRoute] = React.useState(readRoute);
  const path = routePath(route);
  const catalog = useApi<ProductsResponse>("/api/products");
  const shopCatalog = useApi<ShopsResponse>("/api/shops");
  const orderedCatalog = React.useMemo(() => {
    if (!catalog.data) return null;
    const family = (name: string) =>
      ["Plus", "Pro", "Go", "Team"].findIndex((label) => name.includes(label));
    return {
      ...catalog.data,
      products: [...catalog.data.products].sort(
        (a: CatalogProduct, b: CatalogProduct) => {
          const category =
            categories.findIndex(([id]) => id === a.category) -
            categories.findIndex(([id]) => id === b.category);
          const orderA = family(a.name),
            orderB = family(b.name);
          return (
            category ||
            (orderA < 0 ? 99 : orderA) - (orderB < 0 ? 99 : orderB) ||
            (Number.parseInt(a.spec) || 0) - (Number.parseInt(b.spec) || 0) ||
            a.name.localeCompare(b.name, "zh-CN")
          );
        },
      ),
    };
  }, [catalog.data]);
  const [dark, setDark] = React.useState(() => {
    try {
      return localStorage.getItem("bijia-theme-v2") !== "light";
    } catch {
      return true;
    }
  });
  React.useEffect(() => {
    const fn = () => setRoute(readRoute());
    addEventListener("popstate", fn);
    addEventListener("hashchange", fn);
    return () => {
      removeEventListener("hashchange", fn);
      removeEventListener("popstate", fn);
    };
  }, []);
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("bijia-theme-v2", dark ? "dark" : "light");
    } catch {}
  }, [dark]);
  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [route]);
  React.useEffect(() => {
    // Lazily loaded official-price pages set their own meta.
    if (!path.startsWith("/official"))
      updatePageMeta(path, catalog.data, shopCatalog.data?.shops);
  }, [path, catalog.data, shopCatalog.data]);
  let content: React.ReactNode;
  try {
    if (path === "/") content = <Home />;
    else if (path.startsWith("/c/"))
      content = <CategoryPage key={path.slice(3)} category={path.slice(3)} />;
    else if (path === "/search")
      content = (
        <SearchPage
          key={route}
          query={new URLSearchParams(route.split("?")[1]).get("q") || ""}
        />
      );
    else if (path.startsWith("/sku/")) content = <Detail id={path.slice(5)} />;
    else if (path === "/official" || path.startsWith("/official/"))
      content = <OfficialPage app={path.slice(10) || undefined} />;
    else if (path === "/shops") content = <Shops />;
    else if (path === "/favorites") content = <FavoritesPage />;
    else if (path.startsWith("/shops/"))
      content = <ShopDetail key={path} id={path.slice(7)} />;
    else if (path === "/sponsors")
      content = (
        <div className="py-12">
          <h1>合作功能暂缓开放</h1>
          <p className="mt-4">
            <Link href="/">返回首页比价 ↗</Link>
          </p>
        </div>
      );
    else if (path === "/admin/sponsors") content = <SponsorAdmin />;
    else if (path === "/about") content = <About />;
    else if (path === "/submit") content = <Submit />;
    else if (path === "/admin") content = <Admin />;
    else if (path === "/admin/reviews")
      content = <Reviews key={route} />;
    else
      content = (
        <div className="py-20 text-center text-muted-foreground">
          页面不存在。
        </div>
      );
  } catch {
    content = (
      <div className="py-20 text-center text-muted-foreground">
        暂时无法加载。
      </div>
    );
  }
  return (
    <CatalogContext.Provider
      value={{
        catalog: { ...catalog, data: orderedCatalog },
        shops: shopCatalog.data?.shops || [],
        shopError: shopCatalog.error,
        shopLoading: shopCatalog.loading,
        retryShops: shopCatalog.retry,
      }}
    >
      <Shell path={path} dark={dark} onTheme={() => setDark((v) => !v)}>
        <React.Suspense fallback={<Loading />}>{content}</React.Suspense>
      </Shell>
      <UmamiAnalytics path={route} />
    </CatalogContext.Provider>
  );
}

// Admin pages stay out of the public bundle; visitors never download them.
const Admin = React.lazy(() =>
  import("./pages/admin").then((m) => ({ default: m.Admin })),
);
const OfficialPage = React.lazy(() =>
  import("./pages/official").then((m) => ({ default: m.OfficialPage })),
);
const Reviews = React.lazy(() =>
  import("./pages/reviews").then((m) => ({ default: m.Reviews })),
);
export const SponsorAdmin = React.lazy(() =>
  import("@/components/sponsor-admin").then((m) => ({
    default: m.SponsorAdmin,
  })),
);

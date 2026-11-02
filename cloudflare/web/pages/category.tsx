import { SITE_NAME } from "../../shared/site";
import { Link } from "@/components/link";
import type { CatalogProduct } from "../../shared/api-types";
import * as React from "react";

import { Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";

import { PageSkeleton } from "@/components/page-loading";

import { catalogGroups, groupTarget } from "@/lib/catalog-navigation";
import { BrandIcon, brandLabel } from "@/components/brand-icon";

import { useCatalog } from "../lib/catalog-context";
import { RequestError } from "../components/request-error";
import {
  CatalogSidebar,
  CatalogGroupCard,
} from "../components/catalog-navigation";
export function CategoryPage({ category }: { category: string }) {
  const [family, setFamily] = React.useState("all");
  const [showGuide, setShowGuide] = React.useState(false);
  React.useEffect(() => {
    setFamily("all");
    setShowGuide(false);
  }, [category]);
  const {
    catalog: { data: d, error, retry },
  } = useCatalog();
  if (error && !d) return <RequestError message={error} retry={retry} />;
  if (!d) return <PageSkeleton variant="detail" />;
  const allProducts = d.products.filter(
    (p: CatalogProduct) => p.category === category,
  );
  const families = [
    ...new Set<string>(
      allProducts.map((p: CatalogProduct) => p.family || "其他"),
    ),
  ];
  const products =
    family === "all"
      ? allProducts
      : allProducts.filter(
          (p: CatalogProduct) => (p.family || "其他") === family,
        );
  const groups = catalogGroups(products, category);
  const allGroups = catalogGroups(allProducts, category);
  return (
    <>
      <div className="catalog-breadcrumb">
        <Link href="/">{SITE_NAME}</Link>
        <span>/</span>
        {brandLabel(category)}
      </div>
      <div className="catalog-layout">
        <CatalogSidebar category={category} />
        <div className="catalog-content">
          <div className="catalog-page-title">
            <h1>
              <BrandIcon category={category} size={26} />
              {brandLabel(category)}{" "}
              {category === "other" ? "服务与会员比价" : "订阅比价"}
            </h1>
            <p>
              {allGroups.length} 类商品 · {allProducts.length} 种细分规格 ·
              先选类型，再选渠道
            </p>
          </div>
          {category === "other" && families.length > 1 && (
            <div className="catalog-family-filter" aria-label="按周边品牌筛选">
              {["all", ...families].map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={family === value ? "default" : "outline"}
                  aria-pressed={family === value}
                  onClick={() => {
                    setFamily(value);
                    setShowGuide(false);
                  }}
                >
                  {value === "all" ? "全部" : value}
                  <span>
                    {value === "all"
                      ? allProducts.length
                      : allProducts.filter(
                          (p: CatalogProduct) => (p.family || "其他") === value,
                        ).length}
                  </span>
                </Button>
              ))}
            </div>
          )}
          {products.length ? (
            <>
              <section className="catalog-guide">
                <h2>先选商品类型，再选择具体规格。</h2>
                <p>
                  相同用途的规格归在一起，地区、渠道和有效期在类型内选择。每种规格单独展示报价和购买条件。
                </p>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>商品类型</th>
                        <th>如何选择</th>
                        <th>可选规格</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showGuide ? groups : groups.slice(0, 6)).map(
                        (group) => (
                          <tr key={group.id}>
                            <td>
                              <Link href={`/sku/${groupTarget(group)}`}>
                                {category === "other"
                                  ? `${group.family} · `
                                  : ""}
                                {group.label} ↗
                              </Link>
                            </td>
                            <td>{group.description}</td>
                            <td>{group.products.length} 种规格</td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
                {groups.length > 6 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowGuide((v) => !v)}
                    aria-expanded={showGuide}
                  >
                    {showGuide
                      ? "收起类型对照"
                      : `展开全部 ${groups.length} 类商品对照`}
                  </Button>
                )}
              </section>
              <section className="catalog-brand-panel">
                <header>
                  <h2>按类型查看报价</h2>
                  <span>每种规格独立比价</span>
                </header>
                {groups.map((group) => (
                  <CatalogGroupCard key={group.id} group={group} />
                ))}
              </section>
            </>
          ) : (
            <div className="empty-results">
              <Layers3 size={25} />
              <h2>该分类尚无已审核规格</h2>
              <p>有可比报价后会显示在这里。</p>
              <Button asChild variant="outline">
                <Link href="/">查看其他商品</Link>
              </Button>
            </div>
          )}
          <section className="catalog-faq">
            <h2>关于这些报价</h2>
            <details>
              <summary>为什么同类订阅要分开比较？</summary>
              <p>
                不同地区、渠道和交付方式会影响适用账号及购买条件，本站按已审核规格分别展示。
              </p>
            </details>
            <details>
              <summary>页面价格是否包含所有费用？</summary>
              <p>当前显示单件货架价，手续费和最终结算金额需要在原店核对。</p>
            </details>
          </section>
        </div>
      </div>
    </>
  );
}

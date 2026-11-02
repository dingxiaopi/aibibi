import { Link } from "@/components/link";
import type { CatalogProduct } from "../../shared/api-types";
import * as React from "react";

import { ArrowRight, Clock3 } from "lucide-react";

import { PageSkeleton } from "@/components/page-loading";

import { BrandIcon } from "@/components/brand-icon";
import { PriceObservatory } from "@/components/price-observatory";
import { hasActivePrice } from "../../shared/quote-eligibility";
import { useCatalog } from "../lib/catalog-context";
import { RequestError } from "../components/request-error";
import { available, categories } from "../lib/catalog-format";
import { ProductRow } from "../components/product-row";
export function Home() {
  const {
    catalog: { data: d, error, retry },
    shops,
  } = useCatalog();
  React.useEffect(() => {
    if (!d) return;
    let top = 0;
    try {
      top = Number(sessionStorage.getItem("youshu-index-scroll"));
    } catch {}
    if (top > 0) {
      const frame = requestAnimationFrame(() => {
        window.scrollTo({ top, behavior: "instant" });
        try {
          sessionStorage.removeItem("youshu-index-scroll");
        } catch {}
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [d]);
  if (error && !d) return <RequestError message={error} retry={retry} />;
  if (!d) return <PageSkeleton />;
  return (
    <>
      <PriceObservatory
        products={d.products}
        shops={shops}
        available={d.stats.available}
      />
      <div className="price-index-heading" id="price-index">
        <div>
          <span>SUBSCRIPTION DIRECTORY</span>
          <h2>按品牌，找到你的套餐。</h2>
        </div>
        <span>
          {d.products.filter(hasActivePrice).length} 种规格有有效报价 ·
          价格与购买条件一起看
        </span>
      </div>
      <div className="catalog-brand-grid">
        {categories
          .filter(([id]) => id !== "all")
          .map(([category, label]) => {
            const allProducts = d.products.filter(
              (p: CatalogProduct) => p.category === category,
            );
            if (!allProducts.length) return null;
            const products = allProducts.filter(hasActivePrice);
            const popularFamilies = [
              "Manus",
              "Telegram",
              "Perplexity",
              "Runway",
            ];
            const mainSpecs: Record<string, string[]> = {
              gpt: ["plus-phi", "plus-ios", "pro100-ios", "pro200-phi"],
              claude: [
                "claude-ios",
                "claude-max5-us-card",
                "claude-max20-self-month",
                "claude-pro-account-month",
              ],
              grok: [
                "grok-plus-us-card",
                "grok-premium-us-card",
                "grok-super-us-card",
                "grok-ultra-us-card",
              ],
              gemini: [
                "gemini-pro-18-link",
                "gemini-pro-3-link-card",
                "gemini-pro-18-account",
                "gemini-ultra-family-month",
              ],
            };
            const mainPreview = (mainSpecs[category] || [])
              .map((id) => products.find((p: CatalogProduct) => p.id === id))
              .filter((p): p is CatalogProduct => Boolean(p));
            const preview =
              category === "other"
                ? popularFamilies
                    .map(
                      (family) =>
                        products.find(
                          (p: CatalogProduct) =>
                            p.family === family && p.ready_shop_count,
                        ) ||
                        products.find(
                          (p: CatalogProduct) => p.family === family,
                        ),
                    )
                    .filter((p): p is CatalogProduct => Boolean(p))
                : [
                    ...mainPreview,
                    ...products.filter(
                      (p: CatalogProduct) => !mainPreview.includes(p),
                    ),
                  ].slice(0, 4);
            return (
              <section
                className={`catalog-brand-panel${products.length ? "" : " catalog-brand-empty"}`}
                key={category}
              >
                <header>
                  <h2>
                    <BrandIcon category={category} size={21} />
                    {label}
                  </h2>
                  <span>{products.length} 种有效报价</span>
                </header>
                {(preview.length ? preview : products.slice(0, 4)).map(
                  (p: CatalogProduct) => (
                    <ProductRow p={p} key={p.id} remember />
                  ),
                )}
                {!products.length && (
                  <div className="catalog-no-active">
                    <Clock3 size={20} />
                    <p>暂无有效报价</p>
                    <small>有效期内有货的报价会显示在这里</small>
                  </div>
                )}
                <Link className="catalog-view-all" href={`/c/${category}`}>
                  查看全部 {allProducts.length} 种规格 <ArrowRight size={14} />
                </Link>
              </section>
            );
          })}
      </div>
      <section className="catalog-about">
        <h2>比价格，也看清购买条件。</h2>
        <div>
          <section>
            <h3>同规格分别比较</h3>
            <p>渠道、有效期和交付方式分别归类，避免把不同套餐混成一个低价。</p>
          </section>
          <section>
            <h3>有货记录优先</h3>
            <p>仅展示有效期内有货且未受限的报价，失效记录退出公开报价列表。</p>
          </section>
          <section>
            <h3>回原店核对</h3>
            <p>
              展示单件货架价，手续费与结算总价未核验。购买前核对库存和售后。
            </p>
          </section>
        </div>
      </section>
    </>
  );
}

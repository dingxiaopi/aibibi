import { Link } from "@/components/link";
import type { CatalogProduct, MinimumPriceShop } from "../../shared/api-types";
import { ArrowRight } from "lucide-react";

import { BrandIcon } from "@/components/brand-icon";

import { productPrice, money } from "../lib/catalog-format";
import { rememberIndexPosition } from "../lib/session";
export function ProductRow({
  p,
  remember = false,
}: {
  p: CatalogProduct;
  remember?: boolean;
}) {
  return (
    <Link
      href={`/sku/${p.id}`}
      className="catalog-product-row"
      onClick={remember ? rememberIndexPosition : undefined}
    >
      <div className="catalog-product-copy">
        <div>
          {p.category === "other" && (
            <BrandIcon category={p.brand || p.category} size={17} />
          )}
          <h3 title={p.name}>{p.name}</h3>
        </div>
        <p title={p.spec}>{p.spec}</p>
        <small className="catalog-row-meta">
          <span>{p.shop_count} 家收录</span>
          <span>
            {p.ready_shop_count
              ? `${p.ready_shop_count} 家有货可用`
              : p.last_observed_at
                ? "等待重新采集"
                : "暂无有效报价"}
          </span>
        </small>
      </div>
      <div
        className={`catalog-row-price${p.min_price == null ? " is-recorded" : ""}`}
        title={p.min_price_shops
          ?.map((shop: MinimumPriceShop) => shop.name)
          .join("、")}
      >
        {productPrice(p) == null ? (
          <small>暂无有效报价</small>
        ) : (
          <div className="catalog-price-value">
            <small>有货低至</small>
            <strong>
              <em>¥</em>
              {money(productPrice(p))}
            </strong>
          </div>
        )}
        <ArrowRight size={15} />
      </div>
    </Link>
  );
}

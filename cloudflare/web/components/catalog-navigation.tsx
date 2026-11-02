import { navigate } from "@/lib/navigation";
import { Link } from "@/components/link";
import { ArrowUpRight, ArrowRight } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  catalogGroups,
  groupTarget,
  type CatalogGroup,
  type NavigationProduct,
} from "@/lib/catalog-navigation";
import { BrandIcon, brandLabel } from "@/components/brand-icon";

import { useCatalog } from "../lib/catalog-context";
import { productPriceLabel } from "../lib/catalog-format";
export function CatalogSidebar({
  category,
  current,
}: {
  category: string;
  current?: string;
}) {
  const { catalog } = useCatalog();
  const groups = catalogGroups(catalog.data?.products || [], category);
  const active = groups.find((group) =>
    group.products.some((p) => p.id === current),
  );
  const families = [...new Set(groups.map((group) => group.family))];
  const specCount = groups.reduce(
    (sum, group) => sum + group.products.length,
    0,
  );
  return (
    <>
      <aside
        className="catalog-sidebar"
        aria-label={`${brandLabel(category)}商品类型`}
      >
        <h2>
          <BrandIcon category={category} size={19} />
          {brandLabel(category)} 商品 <small>{groups.length} 类</small>
        </h2>
        <Link
          href={`/c/${category}`}
          className={!current ? "is-current" : ""}
          aria-current={!current ? "page" : undefined}
        >
          全部类型{" "}
          <span className="catalog-nav-tail">
            {groups.length}
            <ArrowRight size={13} />
          </span>
        </Link>
        {families.map((family) => (
          <section key={family}>
            <h3>{family}</h3>
            {groups
              .filter((group) => group.family === family)
              .map((group) => (
                <Link
                  href={`/sku/${groupTarget(group, current)}`}
                  key={group.id}
                  className={active?.id === group.id ? "is-current" : ""}
                  aria-current={active?.id === group.id ? "page" : undefined}
                >
                  <span>{group.label}</span>
                  <span className="catalog-nav-tail">
                    {group.products.length > 1 && (
                      <small title={`${group.products.length}种细分规格`}>
                        {group.products.length}
                      </small>
                    )}
                    <ArrowRight size={12} />
                  </span>
                </Link>
              ))}
          </section>
        ))}
        <p className="catalog-nav-note">
          {specCount} 种细分规格 · 进入类型后选择
        </p>
      </aside>
      <div className="catalog-mobile-selector">
        <Select
          value={active?.id || `category:${category}`}
          onValueChange={(value) => {
            const selected = groups.find((group) => group.id === value);
            navigate(
              selected
                ? `/sku/${groupTarget(selected, current)}`
                : `/c/${category}`,
            );
          }}
        >
          <SelectTrigger aria-label="切换商品类型">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={`category:${category}`}>
              {brandLabel(category)} · 全部类型
            </SelectItem>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {category === "other" ? `${group.family} · ` : ""}
                {group.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

export function CatalogVariants({ product }: { product: NavigationProduct }) {
  const { catalog } = useCatalog();
  const group = catalogGroups(
    catalog.data?.products || [],
    product.category,
  ).find((g) => g.products.some((p) => p.id === product.id));
  if (!group || group.products.length < 2) return null;
  return (
    <section className="catalog-variants" aria-label="选择具体规格">
      <div className="catalog-variants-heading">
        <h2>选择具体规格</h2>
        <span>{group.products.length} 种可选</span>
      </div>
      <p>{group.description}</p>
      <nav aria-label={`${group.label}的具体规格`}>
        {group.products.map((p) => (
          <Link
            key={p.id}
            href={`/sku/${p.id}`}
            aria-current={p.id === product.id ? "page" : undefined}
            title={p.name}
          >
            <span>{group.labels[p.id]}</span>
            <small>{productPriceLabel(p)}</small>
          </Link>
        ))}
      </nav>
      <small className="catalog-variants-note">
        仅展示有效期内有货且未受限的报价；购买条件随规格切换。
      </small>
    </section>
  );
}

export function CatalogGroupCard({ group }: { group: CatalogGroup }) {
  return (
    <section className="catalog-type-card">
      <header>
        <Link href={`/sku/${groupTarget(group)}`}>
          {group.category === "other" ? `${group.family} · ` : ""}
          {group.label}
          <ArrowUpRight size={13} />
        </Link>
        <small>{group.products.length} 种规格</small>
      </header>
      <p>{group.description}</p>
      <div>
        {group.products.map((p) => (
          <Link key={p.id} href={`/sku/${p.id}`}>
            <span>{group.labels[p.id]}</span>
            <strong>{productPriceLabel(p)}</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}

import { catalogGroups } from "@/lib/catalog-navigation";

import { useCatalog } from "../lib/catalog-context";
import { CatalogGroupCard } from "./catalog-navigation";
export function RelatedProducts({
  category,
  current,
  family,
}: {
  category: string;
  current: string;
  family?: string;
}) {
  const { catalog } = useCatalog();
  const groups = catalogGroups(catalog.data?.products || [], category).filter(
    (group) =>
      !group.products.some((p) => p.id === current) &&
      (category !== "other" || group.family === family),
  );
  if (!groups.length) return null;
  return (
    <section className="catalog-related">
      <h2>同品牌其他类型</h2>
      <div className="catalog-related-grid">
        {groups.map((group) => (
          <CatalogGroupCard key={group.id} group={group} />
        ))}
      </div>
    </section>
  );
}

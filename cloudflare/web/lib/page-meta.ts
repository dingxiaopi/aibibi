import { pageMeta, productSchema } from "../../shared/page-meta";
import type { ProductsResponse, Shop } from "../../shared/api-types";
export function updatePageMeta(
  path: string,
  catalog?: ProductsResponse | null,
  shops: Shop[] = [],
  special?: { title: string; description: string } | null,
) {
  const meta = pageMeta(
    path,
    location.origin,
    catalog || undefined,
    shops,
    false,
    special,
  );
  document.title = meta.title;
  const set = (
    selector: string,
    attribute: string,
    value: string,
    tag = "meta",
  ) => {
    let node = document.head.querySelector<HTMLElement>(selector);
    if (!node) {
      node = document.createElement(tag);
      document.head.appendChild(node);
    }
    node.setAttribute(attribute, value);
    return node;
  };
  set('meta[name="description"]', "content", meta.description).setAttribute(
    "name",
    "description",
  );
  set('link[rel="canonical"]', "href", meta.canonical, "link").setAttribute(
    "rel",
    "canonical",
  );
  for (const [name, content] of Object.entries({
    title: meta.title,
    description: meta.description,
    url: meta.canonical,
    type: path.startsWith("/sku/") ? "product" : "website",
  })) {
    set(`meta[property="og:${name}"]`, "content", content).setAttribute(
      "property",
      `og:${name}`,
    );
  }
  set(
    'meta[name="robots"]',
    "content",
    meta.noindex || document.querySelector("[data-private]")
      ? "noindex, nofollow"
      : "index, follow",
  ).setAttribute("name", "robots");
  // The server's product schema belongs to the initial URL only.
  document.getElementById("product-schema")?.remove();
  const product = catalog?.products.find((p) => path === `/sku/${p.id}`);
  if (product) {
    const script = document.createElement("script");
    script.id = "product-schema";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(productSchema(product, meta.canonical));
    document.head.appendChild(script);
  }
}

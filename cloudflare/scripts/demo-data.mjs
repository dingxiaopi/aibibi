/** Fictitious fixtures only. No storefront request is made to create this data. */
export function demoSql(at = new Date()) {
  const current = at.toISOString();
  const expired = new Date(at.getTime() - 10 * 86400000).toISOString();
  const sql = (value) => value == null ? "NULL" : "'" + String(value).replaceAll("'", "''") + "'";
  const product = { id: "demo-plus-month", category: "gpt", family: "Plus", name: "ChatGPT Plus（演示）",
    spec: "1 个月 · 示例规格", channel: "虚构报价，仅展示界面", tags: ["演示"] };
  const lines = [`INSERT INTO products VALUES(${sql(product.id)},'gpt',${sql(JSON.stringify(product))}) ON CONFLICT(id) DO UPDATE SET data=excluded.data;`,
    "UPDATE settings SET auto_enabled=0,freshness_hours=168 WHERE id=1;"];
  for (const [index, stock, checked, price] of [[1, "in_stock", current, 99], [2, "out", current, 88], [3, "in_stock", expired, 79], [4, "unknown", current, 95]]) {
    const id = `DEMO_${index}`;
    const shop = { id, platform: "acg", name: `演示店铺 ${index}`, url: `https://shop${index}.example/`,
      checked_at: checked, collection_status: "ok", enabled: true, source_item_count: 1, demo: true };
    const quote = { id: `${id}:N1`, source_goods_id: "N1", shop_id: id, sku: product.id,
      item_name: `虚构商品 ${index}（不可购买）`, item_url: `${shop.url}item/1`, price, currency: "CNY",
      price_basis: "shelf_single_unit", fees: "unverified", stock_status: stock,
      stock_count: stock === "in_stock" ? 10 : stock === "out" ? 0 : null,
      availability: stock === "in_stock" ? "ready" : "unknown", listing_status: "listed",
      collection_status: "ok", checked_at: checked, inventory_checked_at: checked, demo: true };
    lines.push(`INSERT INTO shops(id,platform,name,url,data,status,checked_at) VALUES(${sql(id)},'acg',${sql(shop.name)},${sql(shop.url)},${sql(JSON.stringify(shop))},'ok',${sql(checked)}) ON CONFLICT(id) DO UPDATE SET data=excluded.data,checked_at=excluded.checked_at;`);
    lines.push(`INSERT INTO quotes VALUES(${sql(quote.id)},${sql(id)},${sql(product.id)},${sql(JSON.stringify(quote))}) ON CONFLICT(id) DO UPDATE SET data=excluded.data;`);
  }
  return lines.join("\n") + "\n";
}

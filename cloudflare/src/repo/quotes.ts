/** Prepared statements for quotes; callers retain binding and transaction order. */
export function importMappingUpdateQuotes(env: Env) {
  return env.DB.prepare(
    "UPDATE quotes SET data=json_set(data,'$.collection_status','needs_review','$.collection_error','审核映射已更新，等待新报价') WHERE id=? AND changes()>0",
  );
}

export function importQuoteInsertQuotes(env: Env) {
  return env.DB.prepare(
    "INSERT INTO quotes VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET sku=excluded.sku,data=excluded.data WHERE julianday(COALESCE(json_extract(quotes.data,'$.attempted_at'),json_extract(quotes.data,'$.checked_at')))<=julianday(COALESCE(json_extract(excluded.data,'$.attempted_at'),json_extract(excluded.data,'$.checked_at')))",
  );
}

export function operationsSelectQuotes(env: Env) {
  return env.DB.prepare(
    "SELECT q.data,s.enabled,s.name AS shop_name,s.platform FROM quotes q JOIN shops s ON s.id=q.shop_id",
  );
}

export function coverageCandidatesSelectQuotes(env: Env, where: string) {
  return env.DB.prepare(
    `SELECT g.id,g.shop_id,g.source_id,g.title,g.reason,g.data_at,s.name AS shop_name,s.url AS shop_url,s.platform,EXISTS(SELECT 1 FROM quotes q WHERE q.shop_id=g.shop_id AND q.sku=?) AS existing_shop FROM goods g JOIN shops s ON s.id=g.shop_id WHERE ${where} ORDER BY existing_shop,g.data_at DESC,g.id LIMIT 20 OFFSET ?`,
  );
}

export function adminRoutesUpdateQuotes(env: Env) {
  return env.DB.prepare(
    "UPDATE quotes SET data=json_set(data,'$.collection_status','needs_review','$.collection_error','人工排除') WHERE id=?",
  );
}

export function quoteListSelectQuotes(env: Env, where: string) {
  return env.DB.prepare(
    "SELECT q.data,s.name AS shop_name,s.platform,s.enabled FROM quotes q JOIN shops s ON s.id=q.shop_id " +
      where,
  );
}

/** Sitemap modification times include the latest actual check, regardless of offer eligibility. */
export function sitemapQuoteChecks(env: Env) {
  return env.DB.prepare(
    "SELECT sku,json_extract(data,'$.checked_at') AS checked_at FROM quotes",
  );
}
/** Shop metadata is attached once from the public catalog, avoiding N indexed lookups. */
export const catalogQuotes = (env: Env) =>
  env.DB.prepare("SELECT shop_id,data FROM quotes");

/** Prepared statements for products; callers retain binding and transaction order. */
export function importMappingSelectProducts(env: Env) {
  return env.DB.prepare("SELECT id FROM products WHERE id=?");
}

export function importProductInsertProducts(env: Env) {
  return env.DB.prepare("INSERT OR IGNORE INTO products VALUES(?,?,?)");
}

export function importProductSelectProducts(env: Env) {
  return env.DB.prepare("SELECT data FROM products WHERE id=?");
}

export function coverageSelectProducts(env: Env) {
  return env.DB.prepare("SELECT data FROM products ORDER BY category,id");
}

export function coverageCandidatesSelectProducts(env: Env) {
  return env.DB.prepare("SELECT data FROM products WHERE id=?");
}

export function publicRoutesSelectProducts(env: Env) {
  return env.DB.prepare("SELECT data FROM products WHERE id=?");
}

export function productsSelectProducts(env: Env) {
  return env.DB.prepare("SELECT data FROM products ORDER BY category,id");
}
/** Public catalogs sort their small result in memory to avoid D1 sort reads. */
export const catalogProducts = (env: Env) =>
  env.DB.prepare("SELECT id,category,data FROM products");

/** One canonical URL format for legacy hashes, links and programmatic navigation. */
export function normalizePath(path: string) {
  return path.replace(/^#(?=\/)/, "").replace(/^\/shop\//, "/shops/");
}
/** Match pages by pathname; keep the full route for search, review filters and analytics. */
export function routePath(route: string) {
  return route.split("?")[0];
}
export function readRoute() {
  const legacy = location.hash.startsWith("#/");
  const path = normalizePath(
    legacy ? location.hash : location.pathname + location.search,
  );
  if (legacy || path !== location.pathname + location.search)
    history.replaceState(history.state, "", path);
  return path;
}
export function navigate(to: string) {
  const path = normalizePath(to);
  if (path === location.pathname + location.search) return;
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

import { collectorRoutesSelectGoods } from "../repo/goods";
import { collectorRoutesSelectShops } from "../repo/shops";
import { collectorRoutesSelectMappings } from "../repo/mappings";
import { obj } from "../domain";
import { json, collectorAuthorized } from "../auth";

export async function collectorRoutes(request: Request, env: Env, url: URL) {
  if (!(await collectorAuthorized(request, env)))
    return json({ error: "本地采集令牌无效" }, 401);
  if (url.pathname === "/api/collector/state" && request.method === "GET") {
    const rows = await collectorRoutesSelectGoods(env).all();
    const disabled = await collectorRoutesSelectShops(env).all<{
      id: string;
      data: string;
    }>();
    const mappings = await collectorRoutesSelectMappings(env).all();
    return json({
      rejected: rows.results,
      mapping_states: mappings.results,
      disabled_shops: disabled.results.map((s) => ({
        id: s.id,
        ...obj(JSON.parse(s.data)),
      })),
    });
  }
  if (url.pathname === "/api/collector/transfers") {
    const { beginTransfer, transferState } = await import("../transfers");
    if (request.method === "POST") return await beginTransfer(request, env);
    if (request.method === "GET")
      return await transferState(env, url.searchParams.get("id") || "");
    return json({ error: "方法不支持" }, 405);
  }
  if (url.pathname === "/api/ingest" && request.method === "POST") {
    const { ingestTracked } = await import("../transfers");
    return await ingestTracked(request, env);
  }

  return json({ error: "接口不存在" }, 404);
}

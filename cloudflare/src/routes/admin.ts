import { adminRoutesDeleteSessions } from "../repo/sessions";
import { adminRoutesSelectRuns } from "../repo/runs";
import {
  adminRoutesSelectGoods,
  adminRoutesSelectGoods2,
  adminRoutesSelectGoods3,
  adminRoutesUpdateGoods,
} from "../repo/goods";
import { adminRoutesSelectLeads } from "../repo/leads";
import { adminRoutesSelectJobs } from "../repo/jobs";
import { adminRoutesUpdateSettings } from "../repo/settings";
import { adminRoutesUpdateShops, adminRoutesSelectShops } from "../repo/shops";
import { adminRoutesDeleteMappings } from "../repo/mappings";
import { adminRoutesUpdateQuotes } from "../repo/quotes";
import { text, now, type Shop } from "../domain";
import { json, body, sameOrigin, loggedIn, audit } from "../auth";

import { publicShops } from "../services/catalog";
import type { Settings } from "../repo/settings";
export async function adminRoutes(
  request: Request,
  env: Env,
  url: URL,
  config: Settings,
) {
  const path = url.pathname;
  if (!(await loggedIn(request, env)))
    return json({ error: "需要管理员登录" }, 401);
  if (!["GET", "HEAD"].includes(request.method) && !sameOrigin(request))
    return json({ error: "来源校验失败" }, 403);
  if (path === "/api/admin/quote-reports") {
    const { adminQuoteReports } = await import("../quote-reports");
    return adminQuoteReports(request, env, url);
  }
  if (path === "/api/admin/coverage" && request.method === "GET") {
    const { coverage } = await import("../operations");
    return coverage(env, config.freshness_hours);
  }
  if (path === "/api/admin/coverage/candidates" && request.method === "GET") {
    const { coverageCandidates } = await import("../operations");
    return coverageCandidates(env, url);
  }
  if (path === "/api/admin/collection-status" && request.method === "GET") {
    const { collectionStatus } = await import("../operations");
    return collectionStatus(env, config.freshness_hours);
  }
  if (path === "/api/admin/transfers" && request.method === "POST") {
    const { beginTransfer } = await import("../transfers");
    return beginTransfer(request, env);
  }
  if (path === "/api/admin/ingest" && request.method === "POST") {
    const { ingestTracked } = await import("../transfers");
    return ingestTracked(request, env);
  }
  if (path.startsWith("/api/admin/sponsors")) {
    const { adminSponsors } = await import("../sponsors");
    return adminSponsors(request, env, url);
  }
  if (path === "/api/admin/import" && request.method === "POST") {
    const { importExternal } = await import("../external");
    return importExternal(request, env);
  }
  if (path === "/api/admin/logout" && request.method === "POST") {
    const token = request.headers
      .get("Cookie")
      ?.match(/bijia_session=([A-Za-z0-9-]+)/)?.[1];
    if (token) {
      const { hash } = await import("../domain");
      await adminRoutesDeleteSessions(env)
        .bind(await hash(token))
        .run();
    }
    return json({ ok: true }, 200, {
      "Set-Cookie":
        "bijia_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    });
  }
  if (path === "/api/admin/dashboard" && request.method === "GET") {
    const runs = await adminRoutesSelectRuns(env).all();
    const pending = await adminRoutesSelectGoods(env).first();
    const leads = await adminRoutesSelectLeads(env).all();
    return json({
      settings: config,
      local_collection_only: true,
      shops: await publicShops(env),
      runs: runs.results,
      pending,
      leads: leads.results,
      failures: (await adminRoutesSelectJobs(env).all()).results,
    });
  }
  if (path === "/api/admin/settings" && request.method === "POST") {
    const b = await body(request),
      days = Number(b.interval_days),
      hours = Number(b.freshness_hours);
    if (
      !Number.isInteger(days) ||
      days < 1 ||
      days > 30 ||
      !Number.isInteger(hours) ||
      hours < days * 24 + 12 ||
      hours > 1440 ||
      typeof b.auto_enabled !== "boolean"
    )
      return json(
        { error: "周期1–30天；有效期至少为采集周期加12小时，最长60天" },
        400,
      );
    await adminRoutesUpdateSettings(env).bind(0, days, hours).run();
    await audit(env, "settings", "global");
    return json({ ok: true });
  }
  if (
    (path === "/api/admin/collect" || path === "/api/admin/recover") &&
    request.method === "POST"
  )
    return json({ error: "线上仅接收本地采集结果" }, 410);
  if (path === "/api/admin/shop" && request.method === "POST") {
    const b = await body(request);
    if (typeof b.enabled !== "boolean") return json({ error: "状态无效" }, 400);
    await adminRoutesUpdateShops(env)
      .bind(b.enabled ? 1 : 0, text(b.id))
      .run();
    await audit(env, "shop_enabled", text(b.id));
    return json({ ok: true });
  }
  if (path === "/api/admin/reviews" && request.method === "GET") {
    const offset = Math.max(
      0,
      Math.min(100000, Number(url.searchParams.get("offset")) || 0),
    );
    const id = url.searchParams.get("id") || "";
    const rows = await adminRoutesSelectGoods2(env, id)
      .bind(...(id ? [id] : []), offset)
      .all();
    return json({ items: rows.results, offset });
  }
  if (path === "/api/admin/review" && request.method === "POST") {
    const b = await body(request);
    const row = await adminRoutesSelectGoods3(env).bind(text(b.id)).first<{
      id: string;
      shop_id: string;
      source_id: string;
      raw: string | null;
      fingerprint: string;
      data_at: string;
    }>();
    if (!row) return json({ error: "商品不存在" }, 404);
    if (b.action === "reject") {
      await env.DB.batch([
        adminRoutesUpdateGoods(env).bind(now(), row.id),
        adminRoutesDeleteMappings(env).bind(row.shop_id, row.source_id),
        adminRoutesUpdateQuotes(env).bind(row.id),
      ]);
      await audit(env, "reject", row.id);
      return json({ ok: true });
    }
    if (
      b.action !== "approve" ||
      !row.raw ||
      ![b.sku, b.channel, b.warranty, b.evidence, b.restriction].every(
        (x) => typeof x === "string" && x.trim().length > 0 && x.length <= 1000,
      )
    )
      return json(
        {
          error:
            "请完整填写规格、渠道、售后、归类依据和账号条件；无详情商品需先重新采集",
        },
        400,
      );
    const shop = await adminRoutesSelectShops(env)
      .bind(row.shop_id)
      .first<Shop>();
    if (!shop || !shop.enabled)
      return json({ error: "店铺不存在或已暂停" }, 400);
    return json(
      {
        error:
          "线上仅接收本地 agent 结果；请在本地完成详情审核后，再推送新的采集包",
      },
      400,
    );
  }
  return json({ error: "接口不存在" }, 404);
}

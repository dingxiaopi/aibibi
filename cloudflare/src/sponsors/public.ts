import { publicSponsorsSelectSponsorAssets } from "../repo/sponsor_assets";
import { publicSponsorsSelectSponsorCampaigns } from "../repo/sponsor_campaigns";
import {
  publicSponsorsInsertSponsorDeliveries,
  publicSponsorsDeleteSponsorDeliveries,
  publicSponsorsSelectSponsorDeliveries,
  publicSponsorsUpdateSponsorDeliveries,
} from "../repo/sponsor_deliveries";
import { publicSponsorsDeleteSponsorLimits } from "../repo/sponsor_limits";
import {
  publicSponsorsSelectSponsorInquiries,
  publicSponsorsInsertSponsorInquiries,
} from "../repo/sponsor_inquiries";
import { json, body, sameOrigin } from "../auth";
import { now } from "../domain";
import { sponsorCategories } from "../../shared/sponsors";
import type { SponsorCampaign, PublicSponsor } from "../../shared/sponsors";
import {
  fromRow,
  isBot,
  identity,
  throttle,
  httpsUrl,
  field,
  type Row,
} from "./common";
/** Called behind PUBLIC_SITE or the existing administrator session gate. */
export async function publicSponsors(request: Request, env: Env, url: URL) {
  const path = url.pathname;
  const asset = path.match(/^\/api\/sponsors\/assets\/([a-f0-9-]{36})$/);
  if (asset && request.method === "GET") {
    const row = await publicSponsorsSelectSponsorAssets(env)
      .bind(asset[1])
      .first<{ mime: string; bytes: number[] }>();
    return row
      ? new Response(new Uint8Array(row.bytes), {
          headers: {
            "Content-Type": row.mime,
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          },
        })
      : json({ error: "素材不存在" }, 404);
  }
  if (path === "/api/sponsors" && request.method === "GET") {
    const page = url.searchParams.get("page"),
      category = url.searchParams.get("category") || "all";
    if (
      !["home", "detail"].includes(page || "") ||
      !sponsorCategories.includes(category as SponsorCampaign["category"])
    )
      return json({ error: "页面或品牌不正确" }, 400);
    if (isBot(request)) return json({ ads: [] });
    const at = now();
    const result = await publicSponsorsSelectSponsorCampaigns(env, page)
      .bind(at, at, category)
      .all<Row>();
    if (!result.results.length) return json({ ads: [] });
    if (!(await throttle(env, request, "serve", 60)))
      return json({ error: "请求过于频繁" }, 429);
    const viewer = await identity(request),
      expires = new Date(Date.now() + 6 * 3600000).toISOString();
    const ads: PublicSponsor[] = [];
    const statements: D1PreparedStatement[] = [];
    for (const row of result.results) {
      const {
        target_url: _target,
        status: _status,
        created_at: _created,
        updated_at: _updated,
        ...creative
      } = fromRow(row);
      const delivery_id = crypto.randomUUID();
      statements.push(
        publicSponsorsInsertSponsorDeliveries(env).bind(
          delivery_id,
          row.id,
          row.revision,
          viewer,
          at,
          expires,
        ),
      );
      ads.push({ ...creative, delivery_id });
    }
    if (statements.length) await env.DB.batch(statements);
    // Bounded cleanup; aggregated daily metrics are retained after receipts expire.
    await env.DB.batch([
      publicSponsorsDeleteSponsorDeliveries(env).bind(at),
      publicSponsorsDeleteSponsorLimits(env).bind(at),
    ]);
    return json({ ads });
  }
  if (path === "/api/sponsors/inquiry" && request.method === "POST") {
    if (!sameOrigin(request)) return json({ error: "来源校验失败" }, 403);
    if (!(await throttle(env, request, "inquiry", 3, 3600)))
      return json({ error: "提交过于频繁，请稍后再试" }, 429);
    try {
      const b = await body(request);
      if (b.website) return json({ ok: true }); // Hidden honeypot, no external messages.
      const brand = field(b.brand, "品牌名称", 80),
        contact = field(b.contact, "联系方式", 200),
        message = field(b.message, "合作说明", 1500);
      if (!["hero", "home-inline", "detail", "unsure"].includes(String(b.slot)))
        throw Error("意向广告位不正确");
      const count = await publicSponsorsSelectSponsorInquiries(env).first<{
        n: number;
      }>();
      if ((count?.n || 0) >= 2000)
        return json({ error: "当前暂不接受新线索，请稍后再试" }, 503);
      await publicSponsorsInsertSponsorInquiries(env)
        .bind(crypto.randomUUID(), brand, contact, message, b.slot, now())
        .run();
      return json({ ok: true }, 201);
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : "提交格式不正确" },
        400,
      );
    }
  }
  const click = path.match(/^\/api\/sponsors\/click\/([a-f0-9-]{36})$/);
  if (
    (path === "/api/sponsors/impression" && request.method === "POST") ||
    (click && request.method === "GET")
  ) {
    if (!click && !sameOrigin(request))
      return json({ error: "来源校验失败" }, 403);
    let id = click?.[1] || "";
    if (!click) {
      try {
        id = String((await body(request, 1024)).delivery_id || "");
      } catch {
        return json({ error: "数据不正确" }, 400);
      }
    }
    if (!/^[a-f0-9-]{36}$/.test(id))
      return json({ error: "展示凭据无效" }, 400);
    const at = now();
    const delivery = await publicSponsorsSelectSponsorDeliveries(env)
      .bind(id, at, at)
      .first<Row & { viewer_hash: string; expires_at: string }>();
    if (!delivery) return json({ error: "广告已暂停、更新或到期" }, 410);
    const currentViewer = await identity(request);
    if (
      !isBot(request) &&
      currentViewer === delivery.viewer_hash &&
      delivery.expires_at > at &&
      (await throttle(env, request, "event", 120))
    ) {
      await publicSponsorsUpdateSponsorDeliveries(env, click)
        .bind(
          ...(click
            ? [at, at, id, delivery.revision, at, at]
            : [at, id, delivery.revision, at, at]),
        )
        .run();
    }
    if (click)
      return new Response(null, {
        status: 302,
        headers: {
          Location: httpsUrl(JSON.parse(delivery.data).target_url),
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    return json({ ok: true });
  }
  return json({ error: "广告接口不存在" }, 404);
}

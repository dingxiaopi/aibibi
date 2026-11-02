import {
  adminSponsorsSelectSponsorCampaigns,
  adminSponsorsUpdateSponsorCampaigns,
  adminSponsorsSelectSponsorCampaigns2,
  adminSponsorsInsertSponsorCampaigns,
} from "../repo/sponsor_campaigns";
import {
  adminSponsorsSelectSponsorInquiries,
  adminSponsorsUpdateSponsorInquiries,
} from "../repo/sponsor_inquiries";
import { adminSponsorsSelectSponsorRevisions } from "../repo/sponsor_revisions";
import {
  adminSponsorsSelectSponsorAssets,
  adminSponsorsInsertSponsorAssets,
} from "../repo/sponsor_assets";
import { json, body, audit } from "../auth";
import { now } from "../domain";

import {
  fromRow,
  validateCampaign,
  boundedBytes,
  csvCell,
  report,
  type Row,
} from "./common";
/** Called only after the shared administrator authentication and Origin checks. */
export async function adminSponsors(request: Request, env: Env, url: URL) {
  const path = url.pathname;
  if (path === "/api/admin/sponsors" && request.method === "GET") {
    const campaigns = await adminSponsorsSelectSponsorCampaigns(env).all<Row>();
    const inquiries = await adminSponsorsSelectSponsorInquiries(env).all();
    const stats = await report(env, url);
    if (!stats) return json({ error: "统计日期不正确，范围不能超过一年" }, 400);
    return json({
      campaigns: campaigns.results.map(fromRow),
      inquiries: inquiries.results,
      report: stats,
    });
  }
  if (path === "/api/admin/sponsors/report.csv" && request.method === "GET") {
    const stats = await report(env, url);
    if (!stats) return json({ error: "统计日期不正确" }, 400);
    const lines = [
      ["日期（UTC+8）", "活动ID", "品牌", "广告位", "曝光", "点击", "点击率"],
      ...stats.rows.map((r) => [
        r.day,
        r.campaign_id,
        r.brand,
        r.slot,
        r.impressions,
        r.clicks,
        r.impressions
          ? ((r.clicks / r.impressions) * 100).toFixed(2) + "%"
          : "0%",
      ]),
    ];
    return new Response(
      "\uFEFF" + lines.map((row) => row.map(csvCell).join(",")).join("\r\n"),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="sponsorship-report.csv"',
          "Cache-Control": "no-store",
        },
      },
    );
  }
  if (path === "/api/admin/sponsors/revisions" && request.method === "GET") {
    const rows = await adminSponsorsSelectSponsorRevisions(env)
      .bind(url.searchParams.get("id") || "")
      .all();
    return json({ revisions: rows.results });
  }
  if (path === "/api/admin/sponsors/inquiry" && request.method === "POST") {
    const b = await body(request);
    if (!["pending", "contacted", "closed"].includes(String(b.status)))
      return json({ error: "状态不正确" }, 400);
    const r = await adminSponsorsUpdateSponsorInquiries(env)
      .bind(b.status, String(b.id))
      .run();
    if (!r.meta.changes) return json({ error: "合作线索不存在" }, 404);
    await audit(env, "sponsor_inquiry", String(b.id));
    return json({ ok: true });
  }
  if (path === "/api/admin/sponsors/assets" && request.method === "POST") {
    try {
      const bytes = await boundedBytes(request, 512 * 1024);
      let mime = "";
      if (
        bytes.length > 24 &&
        bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71 &&
        bytes[4] === 13 &&
        bytes[5] === 10 &&
        bytes[6] === 26 &&
        bytes[7] === 10
      ) {
        const view = new DataView(bytes.buffer);
        if (view.getUint32(16) > 4096 || view.getUint32(20) > 4096)
          throw Error("图片尺寸不能超过4096像素");
        mime = "image/png";
      } else if (
        bytes.length > 12 &&
        bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes[2] === 255
      )
        mime = "image/jpeg";
      else if (
        bytes.length > 12 &&
        new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
        new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
      )
        mime = "image/webp";
      if (!mime) throw Error("请上传 PNG、JPEG 或 WebP 图片");
      const count = await adminSponsorsSelectSponsorAssets(env).first<{
        n: number;
      }>();
      if ((count?.n || 0) >= 200)
        return json({ error: "素材已达200个，请先整理素材库" }, 409);
      const id = crypto.randomUUID();
      await adminSponsorsInsertSponsorAssets(env)
        .bind(id, mime, bytes.length, bytes.buffer, now())
        .run();
      await audit(env, "sponsor_asset", id);
      return json({ id, url: `/api/sponsors/assets/${id}` }, 201);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "上传失败" }, 400);
    }
  }
  if (path === "/api/admin/sponsors" && request.method === "POST") {
    let b: Record<string, unknown>,
      value: Awaited<ReturnType<typeof validateCampaign>>;
    try {
      b = await body(request);
      value = await validateCampaign(b, env);
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : "广告配置不正确" },
        400,
      );
    }
    const at = now(),
      id = typeof b.id === "string" && b.id ? b.id : crypto.randomUUID();
    try {
      if (b.id) {
        if (!Number.isSafeInteger(b.revision) || Number(b.revision) < 1)
          return json({ error: "缺少广告版本号" }, 400);
        const result = await adminSponsorsUpdateSponsorCampaigns(env)
          .bind(
            value.slot,
            value.category,
            value.status,
            value.starts_at,
            value.ends_at,
            JSON.stringify(value.creative),
            at,
            id,
            b.revision,
            value.slot,
            value.category,
            value.creative.brand,
          )
          .run();
        if (!result.meta.changes)
          return json(
            {
              error:
                "广告已更新，或已有统计且不能更换品牌、广告位及品牌范围；请刷新或新建活动",
            },
            409,
          );
      } else {
        const count = await adminSponsorsSelectSponsorCampaigns2(env).first<{
          n: number;
        }>();
        if ((count?.n || 0) >= 200)
          return json({ error: "广告活动已达200个" }, 409);
        await adminSponsorsInsertSponsorCampaigns(env)
          .bind(
            id,
            value.slot,
            value.category,
            value.status,
            value.starts_at,
            value.ends_at,
            JSON.stringify(value.creative),
            at,
            at,
          )
          .run();
      }
      await audit(env, "sponsor_save", id);
      return json({ ok: true, id });
    } catch (e) {
      if (String(e).includes("sponsor_schedule_conflict"))
        return json(
          { error: "同一广告位的投放时间与品牌范围冲突，请调整排期" },
          409,
        );
      throw e;
    }
  }
  return json({ error: "广告管理接口不存在" }, 404);
}

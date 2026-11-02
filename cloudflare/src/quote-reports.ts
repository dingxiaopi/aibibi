import { body, json, sameOrigin, audit } from "./auth";
import { hash, now, plain, text, obj } from "./domain";
import {
  reportReasons,
  type ReportReason,
  type ReportSnapshot,
} from "../shared/quote-report";
import {
  reportQuote,
  existingReport,
  reportCapacity,
  cleanReportLimits,
  reserveReport,
  insertReport,
  listReports,
  updateReport,
} from "./repo/quote_reports";

export async function submitQuoteReport(request: Request, env: Env) {
  if (!sameOrigin(request)) return json({ error: "来源校验失败" }, 403);
  const b = await body(request, 4096);
  if (
    typeof b.quote_id !== "string" ||
    b.quote_id.length > 160 ||
    !b.quote_id ||
    typeof b.reason !== "string" ||
    !Object.hasOwn(reportReasons, b.reason) ||
    (b.note != null && (typeof b.note !== "string" || b.note.length > 1000))
  )
    return json({ error: "请选择问题类型，补充说明最多1000字" }, 400);
  const row = await reportQuote(env)
    .bind(b.quote_id)
    .first<{ data: string; shop_name: string }>();
  if (!row) return json({ error: "报价不存在，请刷新页面后重试" }, 404);
  const note = plain(b.note || "");
  if (b.reason === "other" && !note)
    return json({ error: "请补充问题说明" }, 400);
  const at = now(),
    day = new Date(Date.parse(at) + 8 * 3600000).toISOString().slice(0, 10);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const reporter = await hash(`quote-report:${day}:${ip}`);
  const dedup = await hash(`${reporter}:${b.quote_id}:${b.reason}`);
  if (await existingReport(env).bind(dedup).first())
    return json({ ok: true, duplicate: true });
  if ((await reportCapacity(env).first<{ n: number }>())!.n >= 10000)
    return json({ error: "反馈暂时已满，请稍后再试" }, 503);
  await cleanReportLimits(env).bind(at).run();
  const reserved = await reserveReport(env)
    .bind(reporter, new Date(Date.now() + 86400000).toISOString(), at, at, at)
    .first();
  if (!reserved) return json({ error: "今天提交次数已用完，请明天再试" }, 429);
  // Quote identity, price and source come from stored data, never from client claims.
  const q = obj(JSON.parse(row.data));
  const snapshot: ReportSnapshot = {
    sku: text(q.sku),
    shop_id: text(q.shop_id),
    shop_name: row.shop_name,
    item_name: text(q.item_name),
    item_url: text(q.item_url),
    price: Number(q.price),
    checked_at: text(q.checked_at),
  };
  await insertReport(env)
    .bind(
      crypto.randomUUID(),
      b.quote_id,
      b.reason as ReportReason,
      note,
      JSON.stringify(snapshot),
      dedup,
      at,
      at,
    )
    .run();
  return json({ ok: true }, 201);
}

/** Called only after the admin router authenticates and checks the write origin. */
export async function adminQuoteReports(request: Request, env: Env, url: URL) {
  if (request.method === "GET") {
    const status = url.searchParams.get("status") || "pending";
    if (!["pending", "resolved", "dismissed", "all"].includes(status))
      return json({ error: "状态无效" }, 400);
    const offset = Math.min(
      10000,
      Math.max(0, Math.trunc(Number(url.searchParams.get("offset")) || 0)),
    );
    const rows = await listReports(env).bind(status, status, offset).all();
    return json({ reports: rows.results, offset });
  }
  if (request.method === "POST") {
    const b = await body(request);
    if (
      typeof b.id !== "string" ||
      b.id.length > 80 ||
      !["pending", "resolved", "dismissed"].includes(text(b.status))
    )
      return json({ error: "反馈状态无效" }, 400);
    const result = await updateReport(env).bind(b.status, now(), b.id).run();
    if (!result.meta.changes) return json({ error: "反馈不存在" }, 404);
    await audit(env, "quote_report_" + text(b.status), b.id);
    return json({ ok: true });
  }
  return json({ error: "方法不支持" }, 405);
}

import { throttleInsertSponsorLimits } from "../repo/sponsor_limits";
import { validateCampaignSelectSponsorAssets } from "../repo/sponsor_assets";
import { reportSelectSponsorDaily } from "../repo/sponsor_daily";
import { body } from "../auth";
import { hash, now } from "../domain";
import {
  sponsorSlots,
  sponsorCategories,
  type SponsorCampaign,
  type SponsorCreative,
  type SponsorMetric,
} from "../../shared/sponsors";

export type Row = {
  id: string;
  slot: SponsorCampaign["slot"];
  category: SponsorCampaign["category"];
  status: SponsorCampaign["status"];
  starts_at: string;
  ends_at: string;
  revision: number;
  data: string;
  created_at: string;
  updated_at: string;
};
export const fromRow = (row: Row): SponsorCampaign => {
  const { data, ...fields } = row;
  return { ...JSON.parse(data), ...fields };
};
export const isBot = (r: Request) =>
  /bot\b|crawler|spider|slurp|preview/i.test(r.headers.get("User-Agent") || "");
export const identity = (r: Request) =>
  hash(
    `${r.headers.get("CF-Connecting-IP") || "local"}:${r.headers.get("User-Agent") || ""}`,
  );
export async function throttle(
  env: Env,
  r: Request,
  scope: string,
  maximum: number,
  seconds = 60,
) {
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const key = await hash(
    `${scope}:${r.headers.get("CF-Connecting-IP") || "local"}:${bucket}`,
  );
  const result = await throttleInsertSponsorLimits(env)
    .bind(key, new Date((bucket + 2) * seconds * 1000).toISOString(), maximum)
    .first<{ count: number }>();
  return result !== null;
}
export function httpsUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048)
    throw Error("跳转网址过长或格式不正确");
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    !u.hostname.includes(".") ||
    /^(localhost|127\.|\[|0\.)/.test(u.hostname)
  )
    throw Error("请填写公开 HTTPS 跳转网址");
  return u.href;
}
export function field(
  value: unknown,
  name: string,
  max: number,
  required = true,
) {
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    throw Error(`${name}不正确（最多 ${max} 字）`);
  return value.trim();
}
export function stamp(value: unknown) {
  if (
    typeof value !== "string" ||
    !/(Z|[+-]\d\d:\d\d)$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw Error("投放时间格式不正确");
  return new Date(value).toISOString();
}
export async function validateCampaign(
  input: Record<string, unknown>,
  env: Env,
) {
  if (
    !sponsorSlots.includes(input.slot as SponsorCampaign["slot"]) ||
    !sponsorCategories.includes(
      input.category as SponsorCampaign["category"],
    ) ||
    !["draft", "active", "paused"].includes(String(input.status))
  )
    throw Error("广告位、品牌范围或状态不正确");
  const starts_at = stamp(input.starts_at),
    ends_at = stamp(input.ends_at);
  if (ends_at <= starts_at) throw Error("结束时间必须晚于开始时间");
  const creative: SponsorCreative = {
    brand: field(input.brand, "品牌名", 40),
    title: field(input.title, "广告标题", 60),
    description: field(input.description, "说明", 160, false),
    cta: field(input.cta, "按钮文案", 16),
    target_url: httpsUrl(input.target_url),
    logo_asset: "",
    desktop_asset: "",
    mobile_asset: "",
  };
  for (const key of ["logo_asset", "desktop_asset", "mobile_asset"] as const) {
    const id = input[key] ?? "";
    if (typeof id !== "string" || (id && !/^[a-f0-9-]{36}$/.test(id)))
      throw Error("素材标识无效");
    if (
      id &&
      !(await validateCampaignSelectSponsorAssets(env).bind(id).first())
    )
      throw Error("素材不存在，请重新上传");
    creative[key] = id;
  }
  return {
    creative,
    starts_at,
    ends_at,
    slot: input.slot,
    category: input.category,
    status: input.status,
  };
}
export async function boundedBytes(request: Request, max: number) {
  if (Number(request.headers.get("Content-Length") || 0) > max)
    throw Error("素材不能超过512KB");
  const reader = request.body?.getReader();
  if (!reader) throw Error("没有上传文件");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > max) {
      await reader.cancel();
      throw Error("素材不能超过512KB");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export const csvCell = (value: unknown) =>
  '"' +
  String(value ?? "")
    .replace(/^[=+\-@\t\r]/, "'$&")
    .replaceAll('"', '""') +
  '"';
export async function report(env: Env, url: URL) {
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const from =
    url.searchParams.get("from") ||
    new Date(Date.now() + 8 * 3600000 - 29 * 86400000)
      .toISOString()
      .slice(0, 10);
  const to = url.searchParams.get("to") || today;
  if (
    ![from, to].every(
      (d) =>
        /^\d{4}-\d{2}-\d{2}$/.test(d) &&
        Number.isFinite(Date.parse(d)) &&
        new Date(d).toISOString().slice(0, 10) === d,
    ) ||
    from > to ||
    Date.parse(to) - Date.parse(from) > 365 * 86400000
  )
    return null;
  const rows = await reportSelectSponsorDaily(env)
    .bind(from, to)
    .all<SponsorMetric>();
  return { from, to, rows: rows.results };
}

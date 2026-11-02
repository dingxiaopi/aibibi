import { Link } from "@/components/link";
import { PageSkeleton, LoadingStatus } from "@/components/page-loading";
import * as React from "react";
import {
  ArrowLeft,
  Plus,
  Download,
  Eye,
  ImagePlus,
  History,
  Pause,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { SponsorCreativeView, assetUrl } from "./sponsor";
import {
  sponsorSlots,
  sponsorCategories,
  slotLabels,
  type SponsorCampaign,
  type SponsorMetric,
  type SponsorInquiry,
} from "../../shared/sponsors";
type Draft = Omit<
  SponsorCampaign,
  "id" | "revision" | "created_at" | "updated_at"
> & { id?: string; revision?: number };
type Dashboard = {
  campaigns: SponsorCampaign[];
  inquiries: SponsorInquiry[];
  report: { from: string; to: string; rows: SponsorMetric[] };
};
const categoryLabels: Record<string, string> = {
  all: "全部品牌",
  gpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
  cursor: "Cursor",
};
const localDate = (iso: string) =>
  new Date(Date.parse(iso) + 8 * 3600000).toISOString().slice(0, 16);
const fromLocalDate = (value: string) =>
  value ? new Date(value + ":00+08:00").toISOString() : "";
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Singapore",
    dateStyle: "short",
    timeStyle: "short",
    hour12: false,
  }).format(new Date(iso));
const today = () =>
  new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const blank = (): Draft => ({
  slot: "hero",
  category: "all",
  status: "draft",
  brand: "",
  title: "",
  description: "",
  cta: "了解详情",
  target_url: "",
  logo_asset: "",
  desktop_asset: "",
  mobile_asset: "",
  starts_at: new Date(Date.now() - 60000).toISOString(),
  ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
});
const phase = (c: SponsorCampaign) =>
  c.status === "draft"
    ? "草稿"
    : c.status === "paused"
      ? "已暂停"
      : Date.parse(c.ends_at) <= Date.now()
        ? "已到期"
        : Date.parse(c.starts_at) > Date.now()
          ? "待开始"
          : "投放中";
function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([id, name]) => (
            <SelectItem key={id} value={id}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
export function SponsorAdmin() {
  const [data, setData] = React.useState<Dashboard | null>(null),
    [error, setError] = React.useState(""),
    [status, setStatus] = React.useState("");
  const [fetching, setFetching] = React.useState(true);
  const [form, setForm] = React.useState<Draft>(blank),
    [busy, setBusy] = React.useState(false),
    [previewDevice, setPreviewDevice] = React.useState("desktop");
  const [from, setFrom] = React.useState(() =>
      new Date(Date.now() + 8 * 3600000 - 29 * 86400000)
        .toISOString()
        .slice(0, 10),
    ),
    [to, setTo] = React.useState(today);
  const [revisions, setRevisions] = React.useState<
    { revision: number; data: string; at: string }[]
  >([]);
  const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const load = React.useCallback(async () => {
    const value = await api<Dashboard>(
      `/api/admin/sponsors?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    setData(value);
    return value;
  }, [from, to]);
  React.useEffect(() => {
    let active = true;
    setFetching(true);
    void load()
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setFetching(false);
      });
    return () => {
      active = false;
    };
  }, [load]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setForm((old) => ({ ...old, [key]: value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await api<{ id: string }>("/api/admin/sponsors", {
        method: "POST",
        body: JSON.stringify(form),
      });
      const next = await load();
      const saved = next.campaigns.find((c) => c.id === result.id);
      if (saved) setForm(saved);
      setStatus("广告配置已保存。只有已启用且在投放期内的活动才会展示。");
      setRevisions([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };
  async function toggle(campaign: SponsorCampaign) {
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/sponsors", {
        method: "POST",
        body: JSON.stringify({
          ...campaign,
          status: campaign.status === "active" ? "paused" : "active",
        }),
      });
      const next = await load();
      if (form.id === campaign.id)
        setForm(next.campaigns.find((c) => c.id === campaign.id)!);
      setStatus(
        campaign.status === "active"
          ? "广告已暂停，刷新页面后不再展示。"
          : "广告已启用，将按排期展示。",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  async function upload(
    file: File | undefined,
    key: "logo_asset" | "desktop_asset" | "mobile_asset",
  ) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 512 * 1024) throw Error("素材不能超过512KB");
      const response = await fetch("/api/admin/sponsors/assets", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const result = (await response.json()) as { id: string; error?: string };
      if (!response.ok) throw Error(result.error || "上传失败");
      set(key, result.id);
      setStatus("素材已上传，保存广告后生效。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }
  const total = data?.report.rows.reduce(
    (s, r) => ({
      impressions: s.impressions + r.impressions,
      clicks: s.clicks + r.clicks,
    }),
    { impressions: 0, clicks: 0 },
  ) || { impressions: 0, clicks: 0 };
  return (
    <div className="sponsor-admin py-10">
      <Link
        href="/admin"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft size={14} />
        管理后台
      </Link>
      <div className="sponsor-admin-heading">
        <div>
          <div className="eyebrow">SPONSORSHIP CONSOLE</div>
          <h1>品牌合作，有序展示。</h1>
          <p>独立管理广告内容、排期与效果。赞助不改变比价数据。</p>
        </div>
        <Button
          disabled={busy}
          onClick={() => {
            setForm(blank());
            setRevisions([]);
            setError("");
            setStatus("");
            document
              .getElementById("campaign-editor")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <Plus size={15} />
          新建广告
        </Button>
      </div>
      {error && (
        <p role="alert" className="my-5 text-sm text-destructive">
          {error}
          <Button className="ml-3" variant="link" asChild>
            <Link href="/admin">返回后台登录</Link>
          </Button>
        </p>
      )}
      {status && (
        <p role="status" className="my-5 text-sm text-primary">
          {status}
        </p>
      )}
      {fetching && data && <LoadingStatus>正在更新广告配置…</LoadingStatus>}
      {!data ? (
        error ? (
          <p className="my-10 text-muted-foreground">
            请登录管理员账户后重试。
          </p>
        ) : (
          <PageSkeleton variant="console" label="正在读取广告配置…" />
        )
      ) : (
        <>
          <section className="sponsor-report">
            <div className="sponsor-report-controls">
              <h2>投放概览</h2>
              <label>
                开始日期
                <Input
                  aria-label="统计开始日期"
                  type="date"
                  value={from}
                  onChange={(e) => {
                    if (e.target.value) {
                      setError("");
                      setFrom(e.target.value);
                    }
                  }}
                />
              </label>
              <label>
                结束日期
                <Input
                  aria-label="统计结束日期"
                  type="date"
                  value={to}
                  onChange={(e) => {
                    if (e.target.value) {
                      setError("");
                      setTo(e.target.value);
                    }
                  }}
                />
              </label>
              <Button variant="outline" asChild>
                <Link href={`/api/admin/sponsors/report.csv?${query}`}>
                  <Download size={14} />
                  导出 CSV
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setError("");
                  void load().catch((e) => setError(e.message));
                }}
              >
                刷新统计
              </Button>
            </div>
            <div className="sponsor-report-numbers">
              <div>
                <small>曝光</small>
                <strong>{total.impressions}</strong>
              </div>
              <div>
                <small>点击</small>
                <strong>{total.clicks}</strong>
              </div>
              <div>
                <small>点击率</small>
                <strong>
                  {total.impressions
                    ? ((total.clicks / total.impressions) * 100).toFixed(2)
                    : "0.00"}
                  %
                </strong>
              </div>
            </div>
            <p>
              按 UTC+8
              汇总。广告至少50%进入可视区域并持续1秒，或用户主动点击，计一次曝光；同一展示凭据各记一次曝光与点击。预览不计数，基础去重和机器人过滤不能替代第三方审计。
            </p>
          </section>
          <div className="sponsor-editor-layout" id="campaign-editor">
            <section className="campaign-editor">
              <h2>{form.id ? "编辑广告" : "新建广告草稿"}</h2>
              <form onSubmit={save}>
                <div className="campaign-fields">
                  <FieldSelect
                    label="广告位置"
                    value={form.slot}
                    options={sponsorSlots.map((s) => [s, slotLabels[s]])}
                    onChange={(v) => set("slot", v as Draft["slot"])}
                  />
                  <FieldSelect
                    label="品牌范围"
                    value={form.category}
                    options={sponsorCategories.map((c) => [
                      c,
                      categoryLabels[c],
                    ])}
                    onChange={(v) => set("category", v as Draft["category"])}
                  />
                </div>
                <label>
                  赞助品牌
                  <Input
                    required
                    maxLength={40}
                    value={form.brand}
                    onChange={(e) => set("brand", e.target.value)}
                    placeholder="广告商的品牌名称"
                  />
                </label>
                <label>
                  广告标题
                  <Input
                    required
                    maxLength={60}
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="用一句话介绍产品或服务"
                  />
                </label>
                <label>
                  补充说明
                  <Textarea
                    maxLength={160}
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                  />
                </label>
                <div className="campaign-fields">
                  <label>
                    按钮文案
                    <Input
                      required
                      maxLength={16}
                      value={form.cta}
                      onChange={(e) => set("cta", e.target.value)}
                    />
                  </label>
                  <FieldSelect
                    label="投放状态"
                    value={form.status}
                    options={[
                      ["draft", "草稿（不展示）"],
                      ["active", "启用（按排期展示）"],
                      ["paused", "暂停"],
                    ]}
                    onChange={(v) => set("status", v as Draft["status"])}
                  />
                </div>
                <label>
                  跳转网址
                  <Input
                    required
                    type="url"
                    maxLength={2048}
                    placeholder="https://"
                    value={form.target_url}
                    onChange={(e) => set("target_url", e.target.value)}
                  />
                </label>
                <div className="campaign-fields">
                  <label>
                    开始时间（UTC+8）
                    <Input
                      required
                      type="datetime-local"
                      value={localDate(form.starts_at)}
                      onChange={(e) => {
                        if (e.target.value)
                          set("starts_at", fromLocalDate(e.target.value));
                      }}
                    />
                  </label>
                  <label>
                    结束时间（UTC+8）
                    <Input
                      required
                      type="datetime-local"
                      value={localDate(form.ends_at)}
                      onChange={(e) => {
                        if (e.target.value)
                          set("ends_at", fromLocalDate(e.target.value));
                      }}
                    />
                  </label>
                </div>
                <div className="campaign-assets">
                  {(
                    [
                      ["logo_asset", "品牌 Logo"],
                      ["desktop_asset", "桌面背景素材"],
                      ["mobile_asset", "手机背景素材"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <label>
                        <ImagePlus size={14} />
                        {label}
                        <Input
                          type="file"
                          disabled={busy}
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => {
                            void upload(e.target.files?.[0], key);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                      {form[key] && (
                        <div className="asset-preview">
                          <img src={assetUrl(form[key])} alt={label} />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => set(key, "")}
                          >
                            移除
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="campaign-help">
                  图片支持
                  PNG/JPEG/WebP，每张不超过512KB。首页主广告只在筛选结果超过4条时展示；全品牌投放与同位置的分类投放不能在时间上重叠。已有统计的活动请勿更换品牌、位置及品牌范围，应新建活动。上传素材不会自动发布。
                </p>
                <Button disabled={busy}>
                  {busy ? "正在处理…" : form.id ? "保存修改" : "保存广告"}
                </Button>
              </form>
            </section>
            <section className="campaign-preview">
              <div className="flex items-center justify-between gap-3">
                <h2>
                  <Eye size={15} />
                  展示预览
                </h2>
                <Select value={previewDevice} onValueChange={setPreviewDevice}>
                  <SelectTrigger aria-label="预览设备">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desktop">桌面</SelectItem>
                    <SelectItem value="mobile">手机 390px</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div
                className={`campaign-preview-canvas preview-${previewDevice}`}
              >
                <SponsorCreativeView
                  key={`${form.logo_asset}:${previewDevice}`}
                  creative={{
                    ...form,
                    desktop_asset:
                      previewDevice === "mobile"
                        ? form.mobile_asset || form.desktop_asset
                        : form.desktop_asset,
                  }}
                  slot={form.slot}
                  preview
                />
              </div>
              <p className="campaign-help">
                预览仅显示当前表单内容，不发布、不跳转、不记录曝光点击。手机排版以实际390px页面为准。
              </p>
              {form.id && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void api<{ revisions: typeof revisions }>(
                        `/api/admin/sponsors/revisions?id=${form.id}`,
                      )
                        .then((r) => setRevisions(r.revisions))
                        .catch((e) => setError(e.message));
                    }}
                  >
                    <History size={14} />
                    查看修改记录
                  </Button>
                  {revisions.length > 0 && (
                    <div className="campaign-revisions">
                      {revisions.map((r) => (
                        <details key={r.revision}>
                          <summary>
                            版本 {r.revision} · {shortDate(r.at)}
                          </summary>
                          <pre>
                            {JSON.stringify(JSON.parse(r.data), null, 2)}
                          </pre>
                        </details>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
          <section className="sponsor-campaign-list">
            <h2>
              广告活动 <span>{data.campaigns.length}</span>
            </h2>
            {!data.campaigns.length ? (
              <p className="campaign-help">
                尚无广告活动。没有有效投放时，访客页面不显示广告块。
              </p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>品牌／广告</th>
                      <th>位置／品牌范围</th>
                      <th>排期（UTC+8）</th>
                      <th>状态</th>
                      <th>所选期间曝光／点击</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.campaigns.map((c) => {
                      const rows = data.report.rows.filter(
                        (r) => r.campaign_id === c.id,
                      );
                      return (
                        <tr key={c.id}>
                          <td>
                            <b>{c.brand}</b>
                            <small>{c.title}</small>
                          </td>
                          <td>
                            {slotLabels[c.slot]}
                            <small>{categoryLabels[c.category]}</small>
                          </td>
                          <td>
                            {shortDate(c.starts_at)}
                            <small>至 {shortDate(c.ends_at)}</small>
                          </td>
                          <td>
                            <span
                              className="campaign-state"
                              data-state={phase(c)}
                            >
                              {phase(c)}
                            </span>
                            <small>版本 {c.revision}</small>
                          </td>
                          <td>
                            {rows.reduce((s, r) => s + r.impressions, 0)} /{" "}
                            {rows.reduce((s, r) => s + r.clicks, 0)}
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                  setForm(c);
                                  setRevisions([]);
                                  setError("");
                                  document
                                    .getElementById("campaign-editor")
                                    ?.scrollIntoView({ behavior: "smooth" });
                                }}
                              >
                                编辑／预览
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void toggle(c)}
                              >
                                {c.status === "active" ? (
                                  <>
                                    <Pause size={12} />
                                    暂停
                                  </>
                                ) : (
                                  "启用"
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="sponsor-inquiries">
            <h2>
              合作线索 <span>{data.inquiries.length}</span>
            </h2>
            <p className="campaign-help">
              只保存访客提交的信息，不会自动发送邮件或联系对方。
            </p>
            {!data.inquiries.length ? (
              <p className="campaign-help">
                暂无合作线索。公开入口：
                <Link className="text-primary" href="/sponsors">
                  广告合作页 ↗
                </Link>
              </p>
            ) : (
              data.inquiries.map((i) => (
                <div className="sponsor-inquiry" key={i.id}>
                  <div>
                    <b>{i.brand}</b>
                    <small>
                      {shortDate(i.created_at)} ·{" "}
                      {i.slot === "unsure"
                        ? "待沟通位置"
                        : slotLabels[i.slot as keyof typeof slotLabels]}{" "}
                      ·{" "}
                      {i.status === "pending"
                        ? "待处理"
                        : i.status === "contacted"
                          ? "已联系"
                          : "已关闭"}
                    </small>
                    <p className="inquiry-contact">{i.contact}</p>
                    <p>{i.message}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["contacted", "标记已联系"],
                        ["closed", "关闭线索"],
                      ] as const
                    ).map(([state, label]) => (
                      <Button
                        key={state}
                        disabled={busy || i.status === state}
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await api("/api/admin/sponsors/inquiry", {
                              method: "POST",
                              body: JSON.stringify({ id: i.id, status: state }),
                            });
                            await load();
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : "更新失败",
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}

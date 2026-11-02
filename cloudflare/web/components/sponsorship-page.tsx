import { SITE_NAME } from "../../shared/site";
import * as React from "react";
import {
  ArrowUpRight,
  Eye,
  MousePointer2,
  CalendarDays,
  ShieldCheck,
  Send,
} from "lucide-react";
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
import { api } from "@/lib/api";
import { slotLabels, type SponsorSlot } from "../../shared/sponsors";
export function SponsorshipPage() {
  const [slot, setSlot] = React.useState("unsure"),
    [busy, setBusy] = React.useState(false),
    [status, setStatus] = React.useState(""),
    [error, setError] = React.useState("");
  return (
    <article className="cooperation-page">
      <div className="eyebrow">PARTNER WITH AI BIBI</div>
      <h1>
        让对的 AI 用户，
        <br />
        <span className="gradient-text">看见你的品牌。</span>
      </h1>
      <p className="cooperation-intro">
        {SITE_NAME}帮助用户比较 AI
        订阅的规格、价格与购买条件。我们为相关品牌提供明确标注的赞助展示位，报价核验与自然排序保持独立。
      </p>
      <div className="cooperation-slots">
        {(Object.entries(slotLabels) as [SponsorSlot, string][]).map(
          ([id, label]) => (
            <section key={id}>
              <span className="eyebrow">
                {id === "hero"
                  ? "BRAND PARTNER"
                  : id === "home-inline"
                    ? "HOME SPOTLIGHT"
                    : "CONTEXT PARTNER"}
              </span>
              <h2>{label}</h2>
              <p>
                {id === "hero"
                  ? "首页首屏的品牌署名，适合站点合作伙伴。"
                  : id === "home-inline"
                    ? "首批商品卡片后的独立横幅。筛选结果超过4条时展示。"
                    : "相关规格详情页报价表后的独立合作卡片。"}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSlot(id);
                  document.getElementById("sponsor-inquiry")?.scrollIntoView({
                    behavior: matchMedia("(prefers-reduced-motion: reduce)")
                      .matches
                      ? "auto"
                      : "smooth",
                  });
                }}
              >
                咨询这个位置 <ArrowUpRight size={14} />
              </Button>
            </section>
          ),
        )}
      </div>
      <div className="cooperation-details">
        {[
          [
            CalendarDays,
            "按周期沟通",
            "明确页面、位置、设备与投放日期，再协商合作安排。",
          ],
          [
            Eye,
            "可视曝光",
            "达到可视条件或主动点击后计数，常见机器人请求过滤。",
          ],
          [
            MousePointer2,
            "基础效果报表",
            "按广告活动与日期统计曝光和点击，不预先承诺流量或转化。",
          ],
          [
            ShieldCheck,
            "独立比价",
            "赞助不改变最低价、审核规则、店铺收录或自然排序。",
          ],
        ].map(([Icon, title, text]) => {
          const Comp = Icon as typeof Eye;
          return (
            <div key={String(title)}>
              <Comp size={19} />
              <h3>{String(title)}</h3>
              <p>{String(text)}</p>
            </div>
          );
        })}
      </div>
      <section className="cooperation-form" id="sponsor-inquiry">
        <div>
          <span className="eyebrow">START A CONVERSATION</span>
          <h2>聊聊你的合作计划。</h2>
          <p>
            留下品牌介绍、意向广告位和联系方式。信息仅进入本站管理后台，不会公开展示。
          </p>
          <small>
            建议准备品牌 Logo、简短文案与目标网址。图片支持
            PNG、JPEG、WebP，单张不超过512KB。
          </small>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              data = new FormData(form);
            setBusy(true);
            setError("");
            setStatus("");
            try {
              await api("/api/sponsors/inquiry", {
                method: "POST",
                body: JSON.stringify({ ...Object.fromEntries(data), slot }),
              });
              form.reset();
              setSlot("unsure");
              setStatus("合作意向已保存到管理后台，等待处理。");
            } catch (e) {
              setError(e instanceof Error ? e.message : "提交失败");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            品牌／公司名称
            <Input
              name="brand"
              required
              maxLength={80}
              autoComplete="organization"
            />
          </label>
          <label>
            联系方式
            <Input
              name="contact"
              required
              maxLength={200}
              placeholder="邮箱、微信或其他可联系的方式"
            />
          </label>
          <label>
            意向广告位
            <Select value={slot} onValueChange={setSlot}>
              <SelectTrigger aria-label="意向广告位" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unsure">先沟通合适的位置</SelectItem>
                {Object.entries(slotLabels).map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label>
            合作说明
            <Textarea
              name="message"
              required
              minLength={1}
              maxLength={1500}
              placeholder="品牌业务、计划投放时间和希望触达的用户"
            />
          </label>
          <label className="sponsor-honeypot" aria-hidden="true">
            Website
            <Input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          <Button disabled={busy}>
            {busy ? "正在提交…" : "提交合作意向"}
            <Send size={14} />
          </Button>
          {status && (
            <p role="status" className="text-sm text-primary">
              {status}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      </section>
    </article>
  );
}

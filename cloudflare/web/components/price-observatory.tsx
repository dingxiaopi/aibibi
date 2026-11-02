import { SITE_NAME, SITE_LOGO } from "../../shared/site";
import { Link } from "@/components/link";
import * as React from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Clock3,
  Database,
  Layers3,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { BrandIcon } from "./brand-icon";
import "./price-observatory.css";
import { hasActivePrice } from "../../shared/quote-eligibility";

type Product = {
  id: string;
  name: string;
  category: string;
  spec: string;
  min_price: number | null;
  last_observed_at?: string | null;
  ready_shop_count: number;
  shop_count: number;
  min_price_shops?: { name?: string; checked_at?: string; quote_id?: string }[];
};
type Shop = { checked_at?: string | null };
const featuredIds = [
  "plus-phi",
  "claude-ios",
  "grok-ios",
  "gemini-pro-18-link",
];
const brandNames: Record<string, string> = {
  gpt: "ChatGPT",
  claude: "Claude",
  grok: "Grok",
  gemini: "Gemini",
};
const colors: Record<string, string> = {
  gpt: "#75e4c4",
  claude: "#efad89",
  grok: "#afbbff",
  gemini: "#88bfff",
};
const formatPrice = (n: number) =>
  n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const formatTime = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Taipei",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value))
    : "尚无采集记录";

/** Ambient motion conveys the observatory theme, never a live collection status. */
function useObservatoryMotion(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let visible = false;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      element.dataset.motion = String(
        visible && !document.hidden && !media.matches,
      );
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    media.addEventListener("change", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      media.removeEventListener("change", update);
    };
  }, [ref]);
}

function Orbit() {
  return (
    <div className="observatory-orbit" aria-hidden="true">
      <div className="orbit-crosshair orbit-crosshair-x" />
      <div className="orbit-crosshair orbit-crosshair-y" />
      <div className="orbit-circle orbit-circle-outer" />
      <div className="orbit-circle orbit-circle-middle" />
      <div className="orbit-circle orbit-circle-inner" />
      <div className="orbit-ticks" />
      <div className="orbit-sweep" />
      <svg className="orbit-links" viewBox="0 0 320 280" fill="none">
        <path d="M160 140L70 64M160 140L258 87M160 140L253 218M160 140L61 210" />
        <path
          className="orbit-flow"
          d="M70 64L160 140L258 87M61 210L160 140L253 218"
        />
        <circle cx="70" cy="64" r="3" />
        <circle cx="258" cy="87" r="3" />
        <circle cx="253" cy="218" r="3" />
        <circle cx="61" cy="210" r="3" />
      </svg>
      <div className="orbit-core">
        <img src={SITE_LOGO} alt="" />
        <span className="brand-wordmark">{SITE_NAME}</span>
      </div>
      {["gpt", "claude", "gemini", "grok"].map((brand) => (
        <div key={brand} className={`orbit-node orbit-node-${brand}`}>
          <BrandIcon category={brand} size={18} />
        </div>
      ))}
      <span className="orbit-coordinate orbit-coordinate-top">
        PRICE / SPEC / SOURCE
      </span>
      <span className="orbit-coordinate orbit-coordinate-bottom">
        规格先对齐，价格再比较
      </span>
    </div>
  );
}

export function PriceObservatory({
  products,
  shops,
  available,
}: {
  products: Product[];
  shops: Shop[];
  available: number;
}) {
  const root = React.useRef<HTMLElement>(null);
  useObservatoryMotion(root);
  const eligible = products.filter(hasActivePrice);
  const featured = featuredIds
    .map(
      (id) =>
        eligible.find((p) => p.id === id) ||
        eligible.find(
          (p) =>
            p.category ===
            products.find((product) => product.id === id)?.category,
        ),
    )
    .filter((p): p is Product => Boolean(p));
  if (!featured.length) featured.push(...eligible.slice(0, 4));
  const dates = [
    ...shops.map((s) => s.checked_at),
    ...products.flatMap((p) => [
      p.last_observed_at,
      ...(p.min_price_shops || []).map((s) => s.checked_at),
    ]),
  ].filter(
    (v): v is string => typeof v === "string" && Number.isFinite(Date.parse(v)),
  );
  const latest = dates.reduce<string | null>(
    (a, b) => (!a || Date.parse(b) > Date.parse(a) ? b : a),
    null,
  );
  const recorded = available === 0;
  const categories = new Set(products.map((p) => p.category));
  return (
    <section
      ref={root}
      className="price-observatory"
      aria-labelledby="observatory-title"
    >
      <div className="observatory-intro">
        <div>
          <div className="observatory-eyebrow">
            <span /> AI SUBSCRIPTION COMPARISON
          </div>
          <h1 id="observatory-title">
            订阅之前，<span>先比比。</span>
          </h1>
          <p>比较同规格的价格、库存和购买条件，找到适合你的 AI 订阅。</p>
        </div>
        <button
          className="observatory-browse"
          onClick={() =>
            document.getElementById("price-index")?.scrollIntoView({
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "instant"
                : "smooth",
            })
          }
        >
          开始比价 <ArrowDown size={15} />
        </button>
      </div>

      <div className="observatory-console">
        <div className="observatory-console-grid" aria-hidden="true" />
        <header className="observatory-topbar">
          <div>
            <ScanLine size={18} />
            <h2>AI 订阅价格速览</h2>
            <span className="observatory-edition">PRICE OBSERVATORY</span>
          </div>
          <span className="observatory-timestamp">
            <Clock3 size={12} />
            最近采集 {formatTime(latest)}
            <small>UTC+8</small>
          </span>
        </header>

        <div className="observatory-layout">
          <div className="observatory-prices">
            <div className="observatory-section-label">
              <span>热门订阅 · 按具体规格比较</span>
              <span>仅展示有效、有货报价</span>
            </div>
            <div className="observatory-price-grid">
              {featured.map((p, index) => {
                const price = p.min_price;
                const time = p.min_price_shops?.[0]?.checked_at;
                return (
                  <Link
                    href={`/sku/${p.id}`}
                    className="observatory-price-card"
                    key={p.id}
                    style={
                      {
                        "--brand-glow": colors[p.category],
                        "--card-index": index,
                      } as React.CSSProperties
                    }
                    onClick={() => {
                      try {
                        sessionStorage.setItem(
                          "youshu-index-scroll",
                          String(window.scrollY),
                        );
                      } catch {}
                    }}
                  >
                    <div className="observatory-card-heading">
                      <span className="observatory-brand">
                        <BrandIcon category={p.category} size={22} />
                        {brandNames[p.category]}
                      </span>
                      <ArrowUpRight size={16} />
                    </div>
                    <h3 title={p.name}>{p.name}</h3>
                    <div className="observatory-price">
                      <span>有货低至</span>
                      {price != null && (
                        <strong>
                          <small>¥</small>
                          {formatPrice(price)}
                          <em>起</em>
                        </strong>
                      )}
                    </div>
                    <p className="observatory-spec" title={p.spec}>
                      {p.spec}
                    </p>
                    <footer>
                      <span title={p.min_price_shops?.[0]?.name}>
                        来自 {p.min_price_shops?.[0]?.name || "已核验原店"}
                      </span>
                      <span>{formatTime(time)}</span>
                    </footer>
                  </Link>
                );
              })}
              {!featured.length && (
                <div className="observatory-empty" role="status">
                  <Clock3 size={28} />
                  <h3>暂无有效报价</h3>
                  <p>当前没有有效期内有货且未受限的报价。</p>
                  <small>重新采集并核验通过后，价格会显示在这里。</small>
                </div>
              )}
            </div>
          </div>

          <aside className="observatory-monitor" aria-label="目录覆盖情况">
            <div className="observatory-section-label">
              <span>每条报价，都能查来源</span>
              <span className="observatory-monitor-mark">◈</span>
            </div>
            <Orbit />
            <div className="observatory-coverage">
              <div>
                <strong>{shops.length}</strong>
                <span>收录店铺</span>
              </div>
              <div>
                <strong>{products.length}</strong>
                <span>订阅规格</span>
              </div>
              <div>
                <strong>{categories.size}</strong>
                <span>商品分类</span>
              </div>
            </div>
            <Link href="/shops" className="observatory-source-link">
              查看全部店铺 <ArrowUpRight size={13} />
            </Link>
          </aside>
        </div>

        <footer className="observatory-status">
          <span>
            <Database size={13} />
            {recorded
              ? "当前无有效报价，过期、售罄及失效记录已从报价列表移除。"
              : "报价来自原店采集，各规格采集时间及购买条件见详情。"}
          </span>
          <Link href="/about">
            数据口径 <ArrowUpRight size={12} />
          </Link>
        </footer>
        <i
          className="observatory-corner observatory-corner-tl"
          aria-hidden="true"
        />
        <i
          className="observatory-corner observatory-corner-tr"
          aria-hidden="true"
        />
        <i
          className="observatory-corner observatory-corner-bl"
          aria-hidden="true"
        />
        <i
          className="observatory-corner observatory-corner-br"
          aria-hidden="true"
        />
      </div>
      <div className="observatory-trust">
        <span>
          <ShieldCheck size={13} />
          来源可追溯
        </span>
        <i />
        <span>
          <Layers3 size={13} />
          同规格再比价
        </span>
        <i />
        <span>
          <Clock3 size={13} />
          保留原始采集时间
        </span>
        <small>每一笔选择，都有依据。</small>
      </div>
    </section>
  );
}

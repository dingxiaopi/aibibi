import { Link } from "@/components/link";
import * as React from "react";
import { m, useInView, useReducedMotion } from "motion/react";
import { Reveal, useAmbientActive, easeOut } from "./motion";
import { ArrowUpRight, Layers3, ScanLine, ShieldCheck } from "lucide-react";
import { BrandIcon, brandLabel } from "./brand-icon";
import { Button } from "./ui/button";

export type ProductSummary = {
  id: string;
  category: string;
  name: string;
  spec: string;
  min_price: number | null;
  ready_count: number;
  current_count: number;
};
const amount = (value: number) =>
  value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });

export function AnimatedCount({ value }: { value: number }) {
  const [shown, setShown] = React.useState(() =>
    matchMedia("(prefers-reduced-motion: reduce)").matches ? value : 0,
  );
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  React.useEffect(() => {
    if (!inView) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 650);
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onChange = () => {
      if (reduced.matches) {
        cancelAnimationFrame(frame);
        setShown(value);
      }
    };
    reduced.addEventListener("change", onChange);
    return () => {
      cancelAnimationFrame(frame);
      reduced.removeEventListener("change", onChange);
    };
  }, [value, inView]);
  return (
    <span ref={ref} aria-label={String(value)}>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}

export function MarketHero({
  products,
  hours,
  sponsor,
}: {
  products: ProductSummary[];
  hours: number;
  sponsor?: React.ReactNode;
}) {
  const root = React.useRef<HTMLElement>(null);
  const active = useAmbientActive(root);
  const featured = ["plus-phi", "claude-ios", "grok-ios"]
    .map((id) => products.find((product) => product.id === id))
    .filter((product): product is ProductSummary => Boolean(product));
  return (
    <section
      ref={root}
      className={`market-hero${active ? " ambient-running" : ""}`}
      data-ambient-active={active}
    >
      <div className="hero-atmosphere" aria-hidden="true">
        <div className="ambient-orb" />
        <svg
          className="hero-circuit"
          viewBox="0 0 1200 430"
          preserveAspectRatio="none"
        >
          <g className="circuit-base" fill="none" stroke="currentColor">
            <path d="M390 55H555L600 100H760M420 365H560L610 315H850M700 18V54L730 84H1100M820 412V375L870 325H1175" />
          </g>
          <g className="circuit-signal" fill="none" stroke="currentColor">
            <path d="M390 55H555L600 100H760M420 365H560L610 315H850M700 18V54L730 84H1100M820 412V375L870 325H1175" />
          </g>
          <g fill="currentColor">
            <circle cx="390" cy="55" r="2" />
            <circle cx="420" cy="365" r="2" />
            <circle cx="1175" cy="325" r="2" />
          </g>
        </svg>
      </div>
      <Reveal className="hero-copy">
        <div className="eyebrow">
          <span className="signal-dot" /> AI SUBSCRIPTION COMPARISON
        </div>
        <h1>
          订阅之前，
          <br />
          <span className="gradient-text">先比比。</span>
        </h1>
        <p>
          价格、库存、购买条件，一起比较。
          <br />
          规格先对齐，再选适合你的 AI 订阅。
        </p>
        <div className="hero-actions">
          <Button
            size="lg"
            onClick={() =>
              document.getElementById("price-index")?.scrollIntoView({
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "auto"
                  : "smooth",
              })
            }
          >
            开始比价 <ArrowUpRight size={16} />
          </Button>
          <Link href="/about" className="method-link">
            了解数据来源 <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="hero-brands" aria-label="AI 品牌分类">
          {["gpt", "claude", "gemini", "grok", "cursor"].map((category) => (
            <span key={category}>
              <BrandIcon category={category} size={18} />
              {brandLabel(category)}
            </span>
          ))}
        </div>
        {sponsor}
      </Reveal>
      <Reveal className="console-reveal" delay={0.12}>
        <div className="market-console">
          <div className="console-scan" aria-hidden="true" />
          <div className="console-top">
            <div className="console-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <span>AI BIBI / PRICE INDEX</span>
            <ScanLine size={15} />
          </div>
          <div className="console-heading">
            <span>报价速览</span>
            <small>CNY · 可用货架价起</small>
          </div>
          <div className="console-quotes">
            {featured.map((product, index) => (
              <Link
                key={product.id}
                href={`/sku/${product.id}`}
                style={
                  { "--enter-delay": `${index * 90}ms` } as React.CSSProperties
                }
              >
                <span className={`brand-tile brand-${product.category}`}>
                  <BrandIcon category={product.category} size={26} />
                </span>
                <div>
                  <b>
                    {product.category === "gpt" ? "ChatGPT · " : ""}
                    {product.name}
                  </b>
                  <small>{product.spec}</small>
                </div>
                <strong>
                  {product.min_price == null ? (
                    "待核验"
                  ) : (
                    <>
                      <em>¥</em>
                      {amount(product.min_price)}
                    </>
                  )}
                </strong>
              </Link>
            ))}
          </div>
          <div className="console-bottom">
            <span>
              <ShieldCheck size={14} /> 同规格 · 可追溯
            </span>
            <span>有效期 {hours}h</span>
          </div>
          <div className="console-note">
            <Layers3 size={13} /> 每个规格分别核验，库存为采集时观察
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function Coverage({ products }: { products: ProductSummary[] }) {
  const rows = ["gpt", "claude", "grok"]
    .map((category) => {
      const subset = products.filter(
        (product) => product.category === category,
      );
      return {
        category,
        specs: subset.length,
        count: subset.reduce((sum, product) => sum + product.current_count, 0),
      };
    })
    .filter((row) => row.specs > 0);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <section className="coverage-strip">
      <div className="coverage-caption">
        <Layers3 size={16} />
        <span>
          有效报价分布<small>按品牌汇总 · {total} 条</small>
        </span>
      </div>
      <div className="coverage-content">
        <div
          className="coverage-bar"
          aria-label={`品牌报价分布，总计 ${total} 条`}
        >
          {rows.map((row) => (
            <div
              key={row.category}
              className={`coverage-segment segment-${row.category}`}
              style={{ width: total ? `${(row.count / total) * 100}%` : "0%" }}
              title={`${brandLabel(row.category)}：${row.count} 条`}
            />
          ))}
        </div>
        <div className="coverage-legend">
          {rows.map((row) => (
            <span key={row.category}>
              <i className={`segment-${row.category}`} />
              {brandLabel(row.category)}
              <b>{row.count}</b>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function QuoteDistribution({
  quotes,
}: {
  quotes: { id: string; price: number; shop_name?: string; shop_id: string }[];
}) {
  const reduced = useReducedMotion();
  const sorted = [...quotes].sort((a, b) => a.price - b.price);
  const max = Math.max(...sorted.map((quote) => quote.price), 1);
  if (!sorted.length) return null;
  return (
    <section className="quote-distribution">
      <div className="distribution-heading">
        <div>
          <span className="eyebrow">PRICE COMPARISON</span>
          <h2>同规格，价格一目了然。</h2>
          <p>当前筛选下有货且未受限的有效报价 · 单件货架价</p>
        </div>
        <div className="distribution-min">
          <small>最低可用货架价</small>
          <strong>
            <em>¥</em>
            {amount(sorted[0].price)}
          </strong>
        </div>
      </div>
      <div className="price-bars">
        {sorted.slice(0, 8).map((quote, index) => (
          <button
            type="button"
            className="price-bar-row"
            key={quote.id}
            aria-label={`查看${quote.shop_name || quote.shop_id}报价，${amount(quote.price)}元`}
            onClick={() => {
              const row = document.getElementById(`quote-${quote.id}`);
              row?.focus({ preventScroll: true });
              row?.scrollIntoView({
                behavior: reduced ? "instant" : "smooth",
                block: "center",
              });
            }}
          >
            <span title={quote.shop_name || quote.shop_id}>
              {quote.shop_name || quote.shop_id}
            </span>
            <div className="price-bar-track" aria-hidden="true">
              <m.div
                className={
                  quote.price === sorted[0].price ? "best-price-bar" : ""
                }
                initial={reduced ? false : { scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{
                  duration: reduced ? 0 : 0.55,
                  delay: reduced ? 0 : index * 0.04,
                  ease: easeOut,
                }}
                style={{ width: `${(quote.price / max) * 100}%` }}
              />
            </div>
            <b>¥{amount(quote.price)}</b>
          </button>
        ))}
      </div>
      {sorted.length > 8 && (
        <p className="distribution-footnote">
          图中展示价格最低的 8 条，完整报价见下表。
        </p>
      )}
    </section>
  );
}

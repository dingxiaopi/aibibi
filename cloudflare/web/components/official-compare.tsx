import { Link } from "@/components/link";
import { cny, officialFor, regionName } from "../../shared/official-prices";
import "./official-compare.css";

/** App Store prices of the same plan, next to the cheapest shop price. Lazy: carries the official data. */
export default function OfficialCompare({
  sku,
  minimum,
}: {
  sku: string;
  minimum: number | null;
}) {
  const ref = officialFor(sku);
  if (!ref) return null;
  const { app, plan, us, cheapest, regions } = ref;
  const unit = plan.period === "year" ? "/年" : "/月";
  return (
    <section className="official-compare" aria-label="官方订阅价格对比">
      <div>
        <span>美区 App Store 官方价</span>
        <strong>{us ? cny(us.cny) : "暂无"}</strong>
        <small>
          {us ? `${us.display_price}${unit}` : "美区未上架"} · {plan.label}
        </small>
      </div>
      <div>
        <span>App Store 最低地区标价</span>
        <strong>{cny(cheapest.cny)}</strong>
        <small>
          {regionName(cheapest.region)}区 {cheapest.display_price}
          {unit}
        </small>
      </div>
      <div>
        <span>本页第三方最低货架价</span>
        <strong>{minimum === null ? "—" : cny(minimum)}</strong>
        <small>
          税费与交付条件需另行核对。{" "}
          <Link href={`/official/${app.id}`}>
            查看 {regions} 个地区官方价格 →
          </Link>
        </small>
      </div>
    </section>
  );
}

import { Link } from "@/components/link";
import type { Quote } from "../../shared/api-types";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuoteReportButton } from "./quote-report";

import {
  fresh,
  platformName,
  money,
  available,
  date,
} from "../lib/catalog-format";
export function QuoteTable({
  quotes,
  hours,
}: {
  quotes: Quote[];
  hours: number;
}) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>店铺 / 商品</th>
            <th>货架价</th>
            <th>库存与条件</th>
            <th>售后说明</th>
            <th>核验与来源</th>
          </tr>
        </thead>
        <tbody>
          {!quotes.length && (
            <tr>
              <td
                colSpan={5}
                className="py-10 text-center text-muted-foreground"
              >
                当前暂无符合条件的有效报价，过期、售罄或失效记录不展示。
              </td>
            </tr>
          )}
          {quotes.map((q) => (
            <tr
              key={q.id}
              id={`quote-${q.id}`}
              tabIndex={-1}
              className={!fresh(q, hours) ? "quote-expired" : ""}
            >
              <td>
                <Link
                  className="font-semibold hover:text-primary"
                  href={`/shops/${q.shop_id}`}
                >
                  {q.shop_name || q.shop_id}
                </Link>
                <small>
                  {platformName(q.platform)}
                  {q.acquisition_method === "external_local"
                    ? " · 本地采集"
                    : ""}
                </small>
                <small>{q.item_name}</small>
              </td>
              <td>
                <b className="text-xl text-primary">¥{money(q.price)}</b>
                <small>单件货架价 · 另核手续费</small>
              </td>
              <td>
                <span
                  className={
                    available(q, hours) ? "font-semibold text-primary" : ""
                  }
                >
                  {!q.enabled
                    ? "店铺已暂停"
                    : !fresh(q, hours)
                      ? "历史记录 · 以原店现价为准"
                      : q.availability === "delayed"
                        ? "兑换受限"
                        : q.stock_status === "out"
                          ? "上次采集时售罄"
                          : q.stock_status === "unknown"
                            ? "库存未知"
                            : "上次采集时有货"}
                </span>
                <small>
                  {q.stock_count == null
                    ? "数量未公开"
                    : "观察库存 " + q.stock_count}
                </small>
                <small>
                  库存采集：{date(q.inventory_checked_at || q.checked_at)}
                </small>
                <small>{q.availability_note}</small>
              </td>
              <td>
                {q.warranty}
                <small>商家声明</small>
              </td>
              <td>
                <small>{date(q.checked_at)}</small>
                {q.item_url && (
                  <Link
                    className="mt-2 inline-flex text-primary hover:underline"
                    href={q.item_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看原始商品 ↗
                  </Link>
                )}
                <QuoteReportButton quote={q} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QuoteList({
  quotes,
  hours,
}: {
  quotes: Quote[];
  hours: number;
}) {
  return (
    <div className="catalog-offers">
      <div className="catalog-offer-columns" aria-hidden="true">
        <span>#</span>
        <span>店铺</span>
        <span>商品 / 购买条件</span>
        <span>观察库存</span>
        <span>货架价</span>
        <span>来源</span>
      </div>
      {!quotes.length && (
        <div className="catalog-no-results">
          当前暂无符合条件的有效报价，过期、售罄或失效记录不展示。
        </div>
      )}
      {quotes.map((q, index) => {
        const usable = available(q, hours);
        const status = !q.enabled
          ? "店铺已暂停"
          : q.collection_status !== "ok"
            ? q.collection_status === "needs_review"
              ? "说明变更待复核"
              : "本次更新未成功"
            : q.listing_status !== "listed"
              ? "已下架"
              : !fresh(q, hours)
                ? "历史库存记录"
                : q.availability === "delayed"
                  ? "兑换受限"
                  : q.stock_status === "out"
                    ? "采集时售罄"
                    : q.stock_status === "unknown"
                      ? "库存未知"
                      : q.stock_count == null
                        ? "采集时有货"
                        : `库存 ${q.stock_count}`;
        return (
          <article
            key={q.id}
            className={`catalog-offer${usable ? "" : " catalog-offer-muted"}`}
          >
            <span className="catalog-offer-rank">{index + 1}</span>
            <div className="catalog-offer-shop">
              <Link href={`/shops/${q.shop_id}`}>
                <span>{(q.shop_name || q.shop_id).slice(0, 1)}</span>
                <strong>{q.shop_name || q.shop_id}</strong>
              </Link>
              <small>{platformName(q.platform)}</small>
            </div>
            <div className="catalog-offer-product">
              <p>{q.item_name}</p>
              {q.availability_note && <small>{q.availability_note}</small>}
              <details>
                <summary>购买条件与核验依据</summary>
                <p>原始商品：{q.item_name}</p>
                {q.availability_note && <p>适用条件：{q.availability_note}</p>}
                <p>售后：{q.warranty || "源站未提供明确说明"}（商家声明）</p>
                <p>价格采集：{date(q.checked_at)}</p>
                <p>库存采集：{date(q.inventory_checked_at || q.checked_at)}</p>
                <p>
                  {q.acquisition_method === "external_local"
                    ? "由本地采集后推送"
                    : "原店公开来源核验"}{" "}
                  · 手续费及最终结算价未核验
                </p>
              </details>
            </div>
            <div
              className={
                usable
                  ? "catalog-offer-stock catalog-stock"
                  : "catalog-offer-stock"
              }
            >
              {status}
              <small>
                {q.stock_count == null ? "数量未公开" : "数量为采集时观察"}
              </small>
            </div>
            <div className="catalog-offer-price">
              <strong>¥{money(q.price)}</strong>
              <small>{fresh(q, hours) ? "单件货架价" : "历史货架价"}</small>
            </div>
            <div className="catalog-offer-action">
              {q.item_url && (
                <Button asChild variant="outline" size="sm">
                  <Link href={q.item_url} target="_blank" rel="noreferrer">
                    查看原店 <ArrowUpRight size={13} />
                  </Link>
                </Button>
              )}
              <QuoteReportButton quote={q} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

import type { Observation, HistoryResponse } from "../../shared/api-types";
import { useApi } from "@/lib/use-api";

import { PageSkeleton, LoadingStatus } from "@/components/page-loading";

import { date, money } from "../lib/catalog-format";
import { RequestError } from "../components/request-error";
export function History({ id }: { id: string }) {
  const { data, error, retry, loading } = useApi<HistoryResponse>(
    `/api/history/${encodeURIComponent(id)}`,
  );
  const items: Observation[] | null = data?.observations || null;
  if (error && items === null)
    return <RequestError message={error} retry={retry} />;
  return (
    <>
      {error && <RequestError message={error} retry={retry} />}
      {loading && items !== null && (
        <LoadingStatus>正在更新观察历史…</LoadingStatus>
      )}
      {items === null ? (
        <PageSkeleton variant="table" label="正在读取实际观察历史…" />
      ) : items.length ? (
        <div className="table-scroll mt-5">
          <table className="data-table">
            <thead>
              <tr>
                <th>观察时间</th>
                <th>店铺</th>
                <th>商品ID</th>
                <th>观察价格</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={`${x.quote_id}:${x.checked_at}`}>
                  <td>{date(x.checked_at)}</td>
                  <td>{x.name}</td>
                  <td>{String(x.quote_id).split(":").pop()}</td>
                  <td>¥{money(x.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">
          尚无历史观察记录，不生成推测走势。
        </p>
      )}
    </>
  );
}

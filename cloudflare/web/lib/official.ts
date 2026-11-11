import {
  official,
  setOfficial,
  type OfficialData,
} from "../../shared/official-prices";
import { useApi } from "./use-api";

/**
 * Latest official snapshot from the Worker; installs it for the shared helpers
 * before callers render. A cached older copy never replaces a newer one.
 */
export function useOfficial() {
  const { data, error, retry } = useApi<OfficialData>("/api/official");
  if (
    data &&
    data !== official &&
    !(Date.parse(data.collected_at) < Date.parse(official.collected_at))
  )
    setOfficial(data);
  return { data, error, retry };
}

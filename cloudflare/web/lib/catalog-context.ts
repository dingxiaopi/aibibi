import type { ProductsResponse, Shop } from "../../shared/api-types";
import * as React from "react";

import { useApi } from "@/lib/use-api";

export const CatalogContext = React.createContext<{
  catalog: ReturnType<typeof useApi<ProductsResponse>>;
  shops: Shop[];
  shopError: string;
  shopLoading: boolean;
  retryShops: () => void;
} | null>(null);

export function useCatalog() {
  return React.useContext(CatalogContext)!;
}

export type TransferProgress = {
  id: string;
  done: number;
  total: number;
  resumed: number;
};
export function transferPlan(bundle: Record<string, any>): Promise<{
  registration: {
    id: string;
    hashes: string[];
    source_at: string | null;
    counts: Record<string, number>;
  };
  batches: Record<string, any>[];
}>;
export function pushBundle(
  bundle: Record<string, any>,
  send: (
    kind: "transfers" | "ingest",
    payload: Record<string, any>,
  ) => Promise<any>,
  progress?: (state: TransferProgress) => void,
): Promise<Record<string, any>>;

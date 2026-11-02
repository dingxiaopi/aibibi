/** Public reads only: bounded memory, shared requests, no browser storage or timestamp rewriting. */
export type QueryState<T = any> = {
  data: T | null;
  error: string;
  loading: boolean;
  updatedAt: number;
};
type Entry = {
  state: QueryState;
  listeners: Set<() => void>;
  request: Promise<void> | null;
  controller: AbortController | null;
  usedAt: number;
};
export const QUERY_TTL = 30_000;
const entries = new Map<string, Entry>();
export const publicQuery = (path: string) =>
  /^\/api\/(products(?:[/?]|$)|shops(?:[/?]|$)|history\/)/.test(path);
export function queryEntry(path: string) {
  let entry = entries.get(path);
  if (!entry) {
    if (entries.size >= 60) {
      const unused = [...entries]
        .filter(([, value]) => !value.listeners.size && !value.request)
        .sort((a, b) => a[1].usedAt - b[1].usedAt)[0];
      if (unused) entries.delete(unused[0]);
    }
    entry = {
      state: { data: null, error: "", loading: true, updatedAt: 0 },
      listeners: new Set(),
      request: null,
      controller: null,
      usedAt: Date.now(),
    };
    entries.set(path, entry);
  }
  entry.usedAt = Date.now();
  return entry;
}
const emit = (entry: Entry, state: QueryState) => {
  entry.state = state;
  for (const listener of entry.listeners) listener();
};
export async function fetchQuery(
  path: string,
  load: (signal: AbortSignal) => Promise<any>,
  force = false,
) {
  const entry = queryEntry(path);
  if (entry.request) return entry.request;
  if (
    !force &&
    entry.state.data &&
    Date.now() - entry.state.updatedAt < QUERY_TTL
  )
    return;
  const controller = new AbortController();
  entry.controller = controller;
  emit(entry, { ...entry.state, error: "", loading: true });
  const timer = setTimeout(() => controller.abort(), 20_000);
  entry.request = (async () => {
    try {
      const data = await load(controller.signal);
      if (!controller.signal.aborted && entry.controller === controller)
        emit(entry, { data, error: "", loading: false, updatedAt: Date.now() });
    } catch (error) {
      if (entry.controller === controller)
        emit(entry, {
          ...entry.state,
          data:
            error &&
            typeof error === "object" &&
            "status" in error &&
            error.status === 401
              ? null
              : entry.state.data,
          loading: false,
          error: controller.signal.aborted
            ? "查询超时，请重试。"
            : error instanceof TypeError
              ? "网络连接失败，请检查网络后重试。"
              : error instanceof Error
                ? error.message
                : "查询失败，请重试。",
        });
    } finally {
      clearTimeout(timer);
      if (entry.controller === controller) {
        entry.request = null;
        entry.controller = null;
      }
    }
  })();
  return entry.request;
}
export function clearQueries() {
  for (const entry of entries.values()) {
    entry.controller?.abort();
    entry.controller = null;
    entry.request = null;
    emit(entry, { data: null, error: "", loading: true, updatedAt: 0 });
  }
}

export function invalidateQueries() {
  for (const entry of entries.values())
    emit(entry, { ...entry.state, updatedAt: 0 });
}

/** Seed only public query keys, keeping the server's observed/check timestamps intact. */
export function seedQueries(
  data: Record<string, unknown>,
  receivedAt = Date.now(),
) {
  for (const [path, value] of Object.entries(data)) {
    if (!publicQuery(path) || value === null || typeof value !== "object")
      continue;
    const entry = queryEntry(path);
    if (!entry.request)
      emit(entry, {
        data: value,
        error: "",
        loading: false,
        updatedAt: receivedAt,
      });
  }
}

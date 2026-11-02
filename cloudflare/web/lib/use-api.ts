import * as React from "react";
import { api } from "./api";
import { fetchQuery, queryEntry, publicQuery, QUERY_TTL } from "./query-cache";

/** Public pages share reads. Private data remains scoped to the mounted component. */
export function useApi<T = any>(path: string, delay = 0, revision?: unknown) {
  const shared = publicQuery(path);
  const entry = React.useMemo(
    () => (shared ? queryEntry(path) : null),
    [path, shared],
  );
  const [local, setLocal] = React.useState<{
    path: string;
    data: T | null;
    error: string;
    loading: boolean;
  }>({ path, data: null, error: "", loading: true });
  const [attempt, force] = React.useReducer((n) => n + 1, 0);
  const previousAttempt = React.useRef(attempt);
  const subscribe = React.useCallback(
    (listener: () => void) => {
      entry?.listeners.add(listener);
      return () => {
        entry?.listeners.delete(listener);
      };
    },
    [entry],
  );
  const snapshot = React.useCallback(() => entry?.state || null, [entry]);
  const state = React.useSyncExternalStore(subscribe, snapshot, snapshot);
  React.useEffect(() => {
    const forced = previousAttempt.current !== attempt;
    previousAttempt.current = attempt;
    if (entry) {
      const load = () =>
        fetchQuery(path, (signal) => api<T>(path, { signal }), forced);
      const timer = setTimeout(() => {
        void load();
      }, delay);
      const refresh = () => {
        if (!document.hidden)
          void fetchQuery(path, (signal) => api<T>(path, { signal }));
      };
      const interval = setInterval(refresh, QUERY_TTL);
      let mutationTimer: ReturnType<typeof setTimeout>;
      const changed = () => {
        clearTimeout(mutationTimer);
        mutationTimer = setTimeout(refresh, 200);
      };
      window.addEventListener("bijia:data-changed", changed);
      window.addEventListener("focus", refresh);
      document.addEventListener("visibilitychange", refresh);
      return () => {
        clearTimeout(timer);
        clearTimeout(mutationTimer);
        clearInterval(interval);
        window.removeEventListener("bijia:data-changed", changed);
        window.removeEventListener("focus", refresh);
        document.removeEventListener("visibilitychange", refresh);
      };
    }
    const controller = new AbortController();
    setLocal((old) => ({
      path,
      data: old.path === path ? old.data : null,
      error: "",
      loading: true,
    }));
    const deadline = setTimeout(() => {
      controller.abort();
      setLocal((old) => ({
        ...old,
        error: "查询超时，请重试。",
        loading: false,
      }));
    }, 20_000);
    const timer = setTimeout(() => {
      void api<T>(path, { signal: controller.signal })
        .then((data) => {
          if (!controller.signal.aborted)
            setLocal({ path, data, error: "", loading: false });
        })
        .catch((error: Error) => {
          if (!controller.signal.aborted)
            setLocal((old) => ({
              ...old,
              error: error.message,
              loading: false,
            }));
        })
        .finally(() => clearTimeout(deadline));
    }, delay);
    return () => {
      clearTimeout(timer);
      clearTimeout(deadline);
      controller.abort();
    };
  }, [path, delay, attempt, entry, revision]);
  if (state)
    return {
      data: state.data as T | null,
      error: state.error,
      loading: state.loading,
      retry: force,
    };
  return {
    data: local.path === path ? local.data : null,
    error: local.path === path ? local.error : "",
    loading: local.path !== path || local.loading,
    retry: force,
  };
}

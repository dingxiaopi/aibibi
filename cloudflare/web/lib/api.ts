import { clearQueries, invalidateQueries } from "./query-cache";
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(20_000),
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw Object.assign(
      new Error(
        response.ok
          ? "服务返回的数据格式异常，请重试。"
          : "服务暂时不可用，请稍后重试。",
      ),
      { status: response.ok ? 502 : response.status },
    );
  }
  if (!response.ok) {
    const error = new Error(
      typeof data === "object" && data !== null && "error" in data
        ? String(data.error)
        : "请求失败",
    ) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  if (
    options.method &&
    !["GET", "HEAD"].includes(options.method.toUpperCase())
  ) {
    if (/^\/api\/admin\/(login|logout)$/.test(path)) clearQueries();
    else invalidateQueries();
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("bijia:data-changed"));
  }
  return data as T;
}

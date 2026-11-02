const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retry the exact idempotent batch; business conflicts and auth errors stop immediately. */
export function transferSender(
  endpoint,
  token,
  { fetchImpl = fetch, sleep = wait, onRetry = () => {}, attempts = 8 } = {},
) {
  return async (kind, payload) => {
    const path =
      kind === "transfers" ? "/api/collector/transfers" : "/api/ingest";
    for (let attempt = 1; ; attempt++) {
      let retryable = true,
        retryAfter = 0,
        message = "网络请求失败";
      try {
        const response = await fetchImpl(endpoint + path, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30000),
        });
        const data = await response.json().catch(() => null);
        if (response.ok && data && (kind === "transfers" || data.ok === true))
          return data;
        message = `HTTP ${response.status}：${data?.error || "响应格式无效"}`;
        retryable =
          response.ok ||
          [408, 425, 429].includes(response.status) ||
          response.status >= 500 ||
          (response.status === 409 &&
            data?.error === "该任务正在处理，请稍后继续同一采集包");
        const header = response.headers.get("Retry-After");
        retryAfter = header
          ? /^\d+$/.test(header)
            ? Number(header) * 1000
            : Date.parse(header) - Date.now()
          : 0;
      } catch {
        // Do not log headers, tokens, or a proxy URL that may contain credentials.
      }
      if (!retryable || attempt >= attempts)
        throw Error(`${message}（尝试 ${attempt} 次）`);
      const delay = Math.min(
        60000,
        Math.max(2000 * 2 ** (attempt - 1), retryAfter || 0),
      );
      onRetry({
        attempt,
        delay,
        message,
        index: payload.transfer?.index ?? null,
      });
      await sleep(delay);
    }
  };
}

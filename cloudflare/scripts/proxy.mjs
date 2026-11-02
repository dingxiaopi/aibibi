// Preload (`node --import ./scripts/proxy.mjs`): Node 22's fetch ignores HTTPS_PROXY,
// and workers.dev is unreachable here without the system proxy.
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";

// Explicit task override avoids a host application's injected proxy without
// hardcoding a particular user's Clash port or silently bypassing their proxy.
if (process.env.BIJIA_PROXY) {
  process.env.HTTPS_PROXY = process.env.BIJIA_PROXY;
  process.env.HTTP_PROXY = process.env.BIJIA_PROXY;
  delete process.env.https_proxy;
  delete process.env.http_proxy;
}
if (
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy
)
  setGlobalDispatcher(new EnvHttpProxyAgent());

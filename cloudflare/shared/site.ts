import config from "../.local/site.json" with { type: "json" };
export const SITE_NAME = config.name;
export const SITE_URL = config.url;
export const SITE_TAGLINE = config.tagline;
export const SITE_DESCRIPTION = config.description;
export const SITE_LOGO = config.logo;
export const SITE_FAVICON = config.favicon;
export const SITE_REDIRECT_HOSTS: string[] = config.redirectHosts;
export const ANALYTICS_SCRIPT = config.analyticsScript;
export const ANALYTICS_ID = config.analyticsId;
export const DEMO_MODE = config.demo;
export const CATEGORY_NAMES: Record<string, string> = {
  gpt: "ChatGPT",
  claude: "Claude",
  grok: "Grok",
  gemini: "Gemini",
  cursor: "Cursor",
  other: "周边",
};
export const siteOrigin = (requestOrigin: string) => {
  const url = new URL(requestOrigin);
  return url.origin === SITE_URL || SITE_REDIRECT_HOSTS.includes(url.host)
    ? SITE_URL : url.origin;
};

/** Application capacity; keep aligned with collector.sources.SHOP_CAPACITY. */
export const MAX_SHOPS = 200;

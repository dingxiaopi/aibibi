import * as React from "react";
import { SITE_URL, ANALYTICS_SCRIPT, ANALYTICS_ID, DEMO_MODE } from "../../shared/site";

/** Analytics is opt-in for each instance and disabled in demo mode. */
export const UMAMI_WEBSITE_ID = ANALYTICS_ID;
const SCRIPT_URL = ANALYTICS_SCRIPT;

type UmamiPayload = Record<string, unknown>;
type UmamiWindow = Window & {
  umami?: {
    track: (payload: (props: UmamiPayload) => UmamiPayload) => unknown;
  };
};

/** Only public pages are reported; admin paths never reach Umami. */
export function trackedPath(path: string) {
  return path === "/admin" || path.startsWith("/admin/") ? null : path;
}

/** One pageview per route change; auto tracking is off so hash and admin URLs are never sent. */
export function UmamiAnalytics({ path }: { path: string }) {
  const last = React.useRef("");
  const pending = React.useRef<UmamiPayload | null>(null);
  React.useEffect(() => {
    if (
      !UMAMI_WEBSITE_ID ||
      !SCRIPT_URL ||
      DEMO_MODE ||
      !import.meta.env.PROD ||
      location.origin !== SITE_URL
    )
      return;
    const optedOut =
      navigator.doNotTrack === "1" ||
      (navigator as Navigator & { globalPrivacyControl?: boolean })
        .globalPrivacyControl === true;
    const url = trackedPath(path);
    if (optedOut || !url || last.current === url) return;
    const referrer = last.current ? SITE_URL + last.current : document.referrer;
    last.current = url;
    // Wait for App's meta effect (it runs after this child effect) so the title matches the page.
    const timer = setTimeout(() => {
      try {
        const client = window as UmamiWindow;
        const page = { url, referrer, title: document.title };
        const send = (payload: UmamiPayload) =>
          client.umami?.track((props) => ({ ...props, ...payload }));
        if (client.umami) return void send(page);
        pending.current = page;
        if (document.getElementById("bijia-umami")) return;
        const script = document.createElement("script");
        script.id = "bijia-umami";
        script.defer = true;
        script.src = SCRIPT_URL;
        script.dataset.websiteId = UMAMI_WEBSITE_ID;
        script.dataset.autoTrack = "false";
        script.dataset.doNotTrack = "true";
        script.dataset.domains = new URL(SITE_URL).hostname;
        script.addEventListener("load", () => {
          if (pending.current) send(pending.current);
          pending.current = null;
        });
        document.head.appendChild(script);
      } catch {
        /* Analytics failures must never interrupt browsing. */
      }
    });
    return () => clearTimeout(timer);
  }, [path]);
  return null;
}

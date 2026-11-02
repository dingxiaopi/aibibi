import { Link } from "@/components/link";
import * as React from "react";
import { ArrowUpRight, Megaphone } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import type {
  PublicSponsor,
  SponsorCreative,
  SponsorSlot,
} from "../../shared/sponsors";
export const assetUrl = (id: string) => `/api/sponsors/assets/${id}`;

export function useSponsors(page: "home" | "detail", category: string) {
  const [ads, setAds] = React.useState<PublicSponsor[]>([]);
  const [ready, setReady] = React.useState(false);
  const [clock, setClock] = React.useState(Date.now());
  const receipts = React.useRef(
    new Map<string, { ad: PublicSponsor; until: number }>(),
  );
  React.useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      setAds([]);
    }, 3500);
    void api<{ ads: PublicSponsor[] }>(
      `/api/sponsors?page=${page}&category=${encodeURIComponent(category)}`,
      { signal: controller.signal },
    )
      .then(({ ads: incoming }) => {
        const time = Date.now();
        setAds(
          incoming.map((ad) => {
            const key = `${ad.id}:${ad.revision}`,
              previous = receipts.current.get(key);
            if (previous && previous.until > time) return previous.ad;
            receipts.current.set(key, { ad, until: time + 5 * 3600000 });
            return ad;
          }),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setAds([]);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!controller.signal.aborted) setReady(true);
      });
    // Timeout is a failure of the optional ad request, never a page blocker.
    const fallback = setTimeout(() => {
      setReady(true);
    }, 3600);
    return () => {
      controller.abort();
      clearTimeout(timeout);
      clearTimeout(fallback);
    };
  }, [page, category]);
  React.useEffect(() => {
    const future = ads
      .map((ad) => Date.parse(ad.ends_at))
      .filter((end) => end > clock);
    if (!future.length) return;
    const timeout = setTimeout(
      () => setClock(Date.now()),
      Math.min(Math.min(...future) - Date.now() + 10, 2147483647),
    );
    return () => clearTimeout(timeout);
  }, [ads, clock]);
  return {
    ready,
    ads: ads.filter(
      (ad) =>
        Date.parse(ad.ends_at) > clock &&
        (ad.category === "all" || ad.category === category),
    ),
  };
}

export function SponsorCreativeView({
  creative,
  slot,
  deliveryId,
  preview = false,
}: {
  creative: SponsorCreative | Omit<SponsorCreative, "target_url">;
  slot: SponsorSlot;
  deliveryId?: string;
  preview?: boolean;
}) {
  const [logoFailed, setLogoFailed] = React.useState(false);
  React.useEffect(() => setLogoFailed(false), [creative.logo_asset]);
  const link = deliveryId ? `/api/sponsors/click/${deliveryId}` : "#";
  const logo =
    creative.logo_asset && !logoFailed ? (
      <img
        alt=""
        width={40}
        height={40}
        src={assetUrl(creative.logo_asset)}
        onError={() => setLogoFailed(true)}
      />
    ) : (
      <Megaphone size={slot === "hero" ? 16 : 24} aria-hidden="true" />
    );
  return (
    <aside
      aria-label={preview ? "广告预览，不记录曝光点击" : "广告 · 赞助合作"}
      className={`sponsor-creative sponsor-${slot}${preview ? " sponsor-preview" : ""}`}
    >
      {slot !== "hero" && creative.desktop_asset && (
        <picture className="sponsor-art" aria-hidden="true">
          {creative.mobile_asset && (
            <source
              media="(max-width: 620px)"
              srcSet={assetUrl(creative.mobile_asset)}
            />
          )}
          <img
            src={assetUrl(creative.desktop_asset)}
            alt=""
            width={1200}
            height={240}
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
          />
        </picture>
      )}
      <span className="sponsor-tag">
        {preview
          ? "内部预览"
          : slot === "hero"
            ? "本站赞助商"
            : "广告 · 赞助合作"}
      </span>
      <span className="sponsor-logo">{logo}</span>
      <div className="sponsor-copy">
        <b>{creative.brand || "品牌名称"}</b>
        {slot !== "hero" && <h3>{creative.title || "赞助内容标题"}</h3>}
        <p>
          {slot === "hero"
            ? creative.title || "品牌赞助介绍"
            : creative.description || "在这里展示品牌的简短介绍。"}
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link
          href={link}
          target={preview ? undefined : "_blank"}
          rel="sponsored noopener noreferrer"
          onClick={preview ? (e) => e.preventDefault() : undefined}
        >
          {creative.cta || "了解详情"}
          <ArrowUpRight size={13} />
        </Link>
      </Button>
      {!preview && (
        <Link
          className="sponsor-about"
          href="/sponsors"
          aria-label="了解广告合作"
        >
          合作说明
        </Link>
      )}
    </aside>
  );
}

export function Advertisement({ ad }: { ad: PublicSponsor | undefined }) {
  const root = React.useRef<HTMLDivElement>(null);
  const sent = React.useRef("");
  React.useEffect(() => {
    if (
      !ad ||
      !root.current ||
      !window.IntersectionObserver ||
      sent.current === ad.delivery_id
    )
      return;
    let visible = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      clearTimeout(timer);
      timer = undefined;
    };
    const check = () => {
      stop();
      if (
        !visible ||
        document.visibilityState !== "visible" ||
        sent.current === ad.delivery_id
      )
        return;
      timer = setTimeout(() => {
        if (Date.parse(ad.ends_at) <= Date.now()) return;
        sent.current = ad.delivery_id;
        void api("/api/sponsors/impression", {
          method: "POST",
          body: JSON.stringify({ delivery_id: ad.delivery_id }),
          keepalive: true,
        }).catch(() => {});
      }, 1000);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
        check();
      },
      { threshold: [0.5] },
    );
    observer.observe(root.current);
    document.addEventListener("visibilitychange", check);
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", check);
    };
  }, [ad]);
  return ad ? (
    <div className={`sponsor-placement placement-${ad.slot}`} ref={root}>
      <SponsorCreativeView
        creative={ad}
        slot={ad.slot}
        deliveryId={ad.delivery_id}
      />
    </div>
  ) : null;
}

import * as React from "react";
import { navigate, normalizePath } from "../lib/navigation";
export function Link({
  href = "",
  onClick,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const target = normalizePath(href);
  return (
    <a
      {...props}
      href={target}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          (props.target && props.target !== "_self") ||
          props.download != null
        )
          return;
        const url = new URL(target, location.href);
        if (
          url.origin !== location.origin ||
          url.pathname.startsWith("/api/") ||
          !target.startsWith("/") ||
          target.startsWith("//")
        )
          return;
        event.preventDefault();
        navigate(url.pathname + url.search);
      }}
    />
  );
}

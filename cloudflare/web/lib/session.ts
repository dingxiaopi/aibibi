import * as React from "react";

export function useSessionValue(key: string, initial: string) {
  const [value, setValue] = React.useState(() => {
    try {
      return sessionStorage.getItem(key) ?? initial;
    } catch {
      return initial;
    }
  });
  React.useEffect(() => {
    try {
      sessionStorage.setItem(key, value);
    } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}

export function rememberIndexPosition() {
  try {
    sessionStorage.setItem("youshu-index-scroll", String(window.scrollY));
  } catch {}
}

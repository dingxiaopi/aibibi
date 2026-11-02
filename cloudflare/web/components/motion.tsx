import * as React from "react";
import {
  LazyMotion,
  MotionConfig,
  m,
  useInView,
  useReducedMotion,
} from "motion/react";

const features = () =>
  import("./motion-features").then((module) => module.default);
export const easeOut = [0.22, 1, 0.36, 1] as const;

export function MotionProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    const update = () => {
      document.documentElement.dataset.background = String(document.hidden);
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.3, ease: easeOut }}
    >
      <LazyMotion features={features} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <m.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.08 }}
      transition={{
        duration: reduced ? 0 : 0.5,
        delay: reduced ? 0 : delay,
        ease: easeOut,
      }}
    >
      {children}
    </m.div>
  );
}

// Decorative loops run only on visible desktop content in a foreground tab.
export function useAmbientActive(ref: React.RefObject<HTMLElement | null>) {
  const inView = useInView(ref, { amount: 0.05 });
  const reduced = useReducedMotion();
  const [eligible, setEligible] = React.useState(false);
  React.useEffect(() => {
    const desktop = matchMedia("(min-width: 768px)");
    const update = () => setEligible(!document.hidden && desktop.matches);
    update();
    desktop.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      desktop.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return inView && eligible && !reduced;
}

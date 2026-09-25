"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

/** False until the first page this tab loaded has hydrated. */
let hydrated = false;

/**
 * A completed stage's tick (2026-09-25). The one a move has just completed
 * pops in — but only when it appears *after* the page has loaded, which is
 * the moment an advance lands. Ticks that were simply there when the page
 * arrived do not animate: a page that celebrates on every visit is noise.
 */
export function StageTick({ latest }: { latest: boolean }) {
  // Read once, at mount: whether this tick arrived after the page did.
  const [animate] = useState(() => latest && hydrated);
  useEffect(() => {
    hydrated = true;
  }, []);
  return (
    <Check
      className={`size-3.5 ${animate ? "animate-tick-in" : ""}`}
      strokeWidth={2.5}
      aria-hidden
    />
  );
}

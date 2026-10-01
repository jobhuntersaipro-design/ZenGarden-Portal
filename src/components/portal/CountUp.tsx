"use client";

import { AnimatedCounter } from "@/components/arc/animated-counter/animated-counter";

/**
 * How the animated number is written. A string rather than a formatter
 * function, because most callers are server components and a function cannot
 * cross that boundary.
 */
export type CountFormat = "money" | "money0" | "number" | "grouped" | "percent";

/**
 * One headline figure, as Arc's animated counter. It paints the real figure
 * first and rolls each digit on a change, so a KPI never reads zero on its
 * first paint (00-master §4). It takes the tile's own type through
 * `data-count-host` (arc-tokens.css).
 */
export function CountUp({
  value,
  format = "number",
  decimals = 0,
  prefix = "",
  suffix = "",
}: {
  value: number;
  format?: CountFormat;
  /** Only read by `number` and `percent`. */
  decimals?: number;
  /** A sign or unit that belongs to the figure, e.g. `+` on a delta. */
  prefix?: string;
  suffix?: string;
}) {
  const money = format === "money" || format === "money0";
  return (
    <span data-count-host>
      <AnimatedCounter
        value={value}
        prefix={`${prefix}${money ? "RM\u00a0" : ""}`}
        suffix={`${format === "percent" ? "%" : ""}${suffix}`}
        decimals={format === "money" ? 2 : format === "money0" || format === "grouped" ? 0 : decimals}
      />
    </span>
  );
}

"use client";

import { useCountUp } from "@/hooks/useCountUp";
import { formatMYR } from "@/lib/money";
import { formatUnits } from "@/lib/units";

/**
 * How the animated number is written. A string rather than a formatter
 * function, because most callers are server components and a function cannot
 * cross that boundary.
 */
export type CountFormat = "money" | "money0" | "number" | "grouped" | "percent";

const write = (value: number, format: CountFormat, decimals: number): string => {
  switch (format) {
    case "money":
      return formatMYR(value.toFixed(2));
    case "money0":
      return formatMYR(value, 0);
    case "grouped":
      return formatUnits(value);
    case "percent":
      return `${value.toFixed(decimals)}%`;
    case "number":
      return value.toFixed(decimals);
  }
};

/**
 * One headline figure that counts up. Renders the server's value on the first
 * paint and animates after mount — see `useCountUp` for why that ordering is
 * the whole point.
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
  const shown = useCountUp(value);
  return (
    <>
      {prefix}
      {write(shown, format, decimals)}
      {suffix}
    </>
  );
}

"use client";

import type { ReactNode } from "react";
import { useCountUp } from "@/hooks/useCountUp";
import { formatMYR } from "@/lib/money";

/**
 * The value is server-rendered and the count-up runs over it, never before it.
 * A screenshot at t=0 shows the real figure (design reference §3.2).
 */
export function KpiTile({
  label,
  value,
  caption,
  wide = false,
  compact = false,
}: {
  label: string;
  value: ReactNode;
  caption: ReactNode;
  wide?: boolean;
  /**
   * A step down to `heading-md`. Four money tiles across a row cannot hold a
   * full MYR figure at display size, and "RM 741,941.12" broken over two lines
   * is not a number any more.
   */
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-md border border-hairline bg-canvas p-md ${wide ? "sm:col-span-2" : ""}`}
    >
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        {label}
      </p>
      <p
        className={`mt-xxs font-display font-[650] text-ink tabular-nums ${
          compact
            ? "text-[length:var(--text-heading-md)] tracking-[-0.91px]"
            : "text-[length:var(--text-display-md)] tracking-[-1.36px]"
        }`}
      >
        {value}
      </p>
      <p className="mt-xxs text-[length:var(--text-caption)] text-ink-secondary">
        {caption}
      </p>
    </div>
  );
}

/** Money is never abbreviated in a KPI — `RM 1.2M` is banned here. */
export function CountUpMoney({ value }: { value: number }) {
  return <>{formatMYR(useCountUp(value).toFixed(2))}</>;
}

export function CountUpNumber({
  value,
  decimals = 0,
  suffix = "",
}: {
  value: number;
  decimals?: number;
  suffix?: string;
}) {
  return <>{`${useCountUp(value).toFixed(decimals)}${suffix}`}</>;
}

import { isValidElement, type ReactNode } from "react";
import { CountUp } from "@/components/portal/CountUp";

/**
 * A KPI tile.
 *
 * These tiles counted up over 900 ms until 2026-09-06, when the review filed
 * the animation as the "laggy / unresponsive" complaint: Dashboard read 13 POs
 * / RM 254k and then 38 POs / RM 737k, both of them 34% of the final figures,
 * which is one frame of an ease-out cubic and not a data refetch at all. The
 * animation was cut and the tiles rendered their server value only.
 *
 * It is back, by request on the same day — with the rule that made the old
 * one unsafe kept: the figure is Arc's animated counter (`CountUp`), which
 * paints the true number first and rolls only the digits that change, so a
 * static capture of the markup cannot be caught at zero.
 */
export function KpiTile({
  label,
  value,
  caption,
  wide = false,
  compact = false,
  mobileFull = false,
}: {
  label: string;
  value: ReactNode;
  caption: ReactNode;
  wide?: boolean;
  /**
   * A step down to `heading-md`. Four money tiles across a row cannot hold a
   * full MYR figure at display size, and "RM 741,941.12" broken over two lines
   * is not a number any more. A money tile narrower than
   * `--container-kpi-money` (a 1280 window) steps once more, to `heading-sm`
   * (S-18).
   */
  compact?: boolean;
  /**
   * Full width on a phone, its normal share from `sm` up.
   *
   * KPI rows are two-up on mobile now — one tile per row put 630px of mostly
   * empty box between the reader and the first buyer (2026-09-06 review, B5).
   * A money value cannot live in half of a 390px screen, though, and the rule
   * above forbids wrapping it, so money tiles take the whole row instead.
   * `wide` already implies this: half of four columns is all of two.
   */
  mobileFull?: boolean;
}) {
  // Only a money figure steps down in a narrow tile: it cannot wrap and
  // cannot be abbreviated, where a count or a name can sit at full size.
  const fitsMoney = compact && isValidElement(value) && value.type === KpiMoney;
  const span = wide
    ? "col-span-2"
    : mobileFull
      ? "col-span-2 sm:col-span-1"
      : "";
  return (
    <div
      className={`rounded-md border border-hairline bg-canvas p-md ${fitsMoney ? "@container" : ""} ${span}`}
    >
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        {label}
      </p>
      {/* `break-words` because a KPI value is not always a number: "Northwind
          Traders" in the Top buyer tile overflowed its own tile and was clipped
          mid-word — "Northwii Traders" — at 768px (2026-09-06 review, A6). */}
      <p
        className={`mt-xxs font-display font-[650] break-words text-ink tabular-nums ${
          fitsMoney
            ? "text-[length:var(--text-heading-sm)] tracking-[-0.54px] @kpi-money:text-[length:var(--text-heading-md)] @kpi-money:tracking-[-0.91px]"
            : compact
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
export function KpiMoney({ value }: { value: number }) {
  return <CountUp value={value} format="money" />;
}

export function KpiNumber({
  value,
  decimals = 0,
  suffix = "",
}: {
  value: number;
  decimals?: number;
  suffix?: string;
}) {
  return <CountUp value={value} decimals={decimals} suffix={suffix} />;
}

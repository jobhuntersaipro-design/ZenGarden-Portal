import type { ShareSlice } from "@/lib/analytics/share";
import { OTHER_VAR, SHARE_VARS, cssVar } from "@/lib/analytics/palette";
import { formatMYR } from "@/lib/money";

const colorFor = (index: number, isOther: boolean) =>
  cssVar(isOther ? OTHER_VAR : SHARE_VARS[index % SHARE_VARS.length]);

/**
 * A 168px conic-gradient ring. Colours are assigned by rank in a fixed order
 * and never cycled — the seventh slice is "Other", not a new hue.
 */
export function DonutShare({
  eyebrow,
  slices,
  centreLabel,
  bare = false,
}: {
  eyebrow: string;
  slices: ShareSlice[];
  centreLabel: string;
  /** Ring only: the buyer page nests it inside a card that has its own frame. */
  bare?: boolean;
}) {
  if (slices.length === 0) {
    return (
      <section className="rounded-lg border border-hairline bg-canvas p-lg">
        <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          {eyebrow}
        </p>
        <p className="mt-md text-[length:var(--text-body-sm)] text-ink-secondary">
          Nothing sold in this range.
        </p>
      </section>
    );
  }

  // Each slice's start is the sum of the ones before it. Written as a pure
  // expression rather than a running counter: at six slices the extra work is
  // nothing, and nothing is mutated during render.
  const startAt = (index: number) =>
    slices.slice(0, index).reduce((sum, slice) => sum + slice.share, 0);

  const stops = slices.map((slice, index) => {
    const from = startAt(index);
    return `${colorFor(index, slice.isOther)} ${from}% ${from + slice.share}%`;
  });

  const ring = (
    <div
      role="img"
      aria-label={`${eyebrow || "Share"}: ${slices.map((s) => `${s.label} ${s.share.toFixed(0)}%`).join(", ")}`}
      className="relative size-donut shrink-0 rounded-full"
      style={{ backgroundImage: `conic-gradient(${stops.join(", ")})` }}
    >
      <div className="absolute inset-lg flex flex-col items-center justify-center rounded-full bg-canvas text-center">
        <span className="font-display text-[length:var(--text-heading-sm)] font-[650] text-ink tabular-nums">
          {slices[0].share.toFixed(0)}%
        </span>
        <span className="text-[length:var(--text-caption)] text-ink-tertiary">
          {centreLabel}
        </span>
      </div>
    </div>
  );

  if (bare) return ring;

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <p className="mb-md font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        {eyebrow}
      </p>
      <div className="flex flex-wrap items-center gap-lg">
        {ring}

        {/* Every slice is directly labelled, which is what discharges the
            contrast warning on the orange (00-master.md §4). */}
        <ul className="flex min-w-0 flex-1 flex-col gap-xs">
          {slices.map((slice, index) => (
            <li key={slice.id} className="flex items-center gap-xs">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-xxs"
                style={{ backgroundColor: colorFor(index, slice.isOther) }}
              />
              <span
                title={slice.label}
                className={`min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] ${slice.isOther ? "text-ink-disabled" : "text-ink"}`}
              >
                {slice.label}
              </span>
              <span className="shrink-0 tabular-nums text-[length:var(--text-caption)] text-ink-secondary">
                {slice.share.toFixed(0)}%
              </span>
              <span className="shrink-0 tabular-nums text-[length:var(--text-caption)] text-ink-tertiary">
                {formatMYR(slice.value.toFixed(2))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { ShareSlice } from "@/lib/analytics/share";
import { OTHER_VAR, SHARE_VARS, cssVar } from "@/lib/analytics/palette";
import { formatMYR } from "@/lib/money";

const colorFor = (index: number, isOther: boolean) =>
  cssVar(isOther ? OTHER_VAR : SHARE_VARS[index % SHARE_VARS.length]);

/**
 * The route an entity in this donut belongs to — `/buyers` or `/products`.
 * A string rather than a function because the dashboard renders this from a
 * server component, and a formatter cannot cross that boundary.
 */
export type EntityBase = "/buyers" | "/products";

const linkClass =
  "min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] text-ink underline-offset-2 hover:text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded-xxs";

/**
 * A 168px conic-gradient ring. Colours are assigned by rank in a fixed order
 * and never cycled — the seventh slice is "Other", not a new hue.
 *
 * Every named slice is a link to the thing it counts, and "Other" opens to
 * show what it is hiding. The ring itself keeps one grey "Other" arc even
 * while the list is open: unfolding it into arcs would need hues past the six
 * the palette validates, which is the rule the fold exists to protect.
 */
export function DonutShare({
  eyebrow,
  slices,
  centreLabel,
  hrefBase,
  bare = false,
}: {
  eyebrow: string;
  slices: ShareSlice[];
  centreLabel: string;
  /** Omit for a donut whose slices are not rows in a table anywhere. */
  hrefBase?: EntityBase;
  /** Ring only: the buyer page nests it inside a card that has its own frame. */
  bare?: boolean;
}) {
  const [openOther, setOpenOther] = useState(false);
  // Two donuts sit side by side on the dashboard, so the panel id has to be
  // per instance or `aria-controls` points at the wrong card.
  const otherId = useId();

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
          {slices.map((slice, index) => {
            const swatch = (
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-xxs"
                style={{ backgroundColor: colorFor(index, slice.isOther) }}
              />
            );
            const figures = (
              <>
                <span className="shrink-0 tabular-nums text-[length:var(--text-caption)] text-ink-secondary">
                  {slice.share.toFixed(0)}%
                </span>
                <span className="shrink-0 tabular-nums text-[length:var(--text-caption)] text-ink-tertiary">
                  {formatMYR(slice.value.toFixed(2))}
                </span>
              </>
            );

            if (slice.isOther) {
              const members = slice.members ?? [];
              return (
                <li key={slice.id} className="flex flex-col gap-xs">
                  <button
                    type="button"
                    aria-expanded={openOther}
                    aria-controls={otherId}
                    onClick={() => setOpenOther((open) => !open)}
                    className="flex items-center gap-xs rounded-xxs text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {swatch}
                    <span className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] text-ink-disabled">
                      {slice.label}
                    </span>
                    <ChevronDown
                      aria-hidden
                      className={`size-3.5 shrink-0 text-ink-tertiary transition-transform duration-[0.25s] ${openOther ? "rotate-180" : ""}`}
                    />
                    {figures}
                  </button>

                  {openOther && members.length > 0 ? (
                    <ul
                      id={otherId}
                      className="ml-md flex flex-col gap-xxs border-l border-hairline pl-sm"
                    >
                      {members.map((member) => (
                        <li
                          key={member.id}
                          className="flex items-center gap-xs"
                        >
                          {hrefBase ? (
                            <Link
                              href={`${hrefBase}/${member.id}`}
                              title={member.label}
                              className={linkClass}
                            >
                              {member.label}
                            </Link>
                          ) : (
                            <span
                              title={member.label}
                              className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] text-ink"
                            >
                              {member.label}
                            </span>
                          )}
                          <span className="shrink-0 tabular-nums text-[length:var(--text-caption)] text-ink-secondary">
                            {member.share.toFixed(1)}%
                          </span>
                          <span className="shrink-0 tabular-nums text-[length:var(--text-caption)] text-ink-tertiary">
                            {formatMYR(member.value.toFixed(2))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            }

            return (
              <li key={slice.id} className="flex items-center gap-xs">
                {swatch}
                {hrefBase ? (
                  <Link
                    href={`${hrefBase}/${slice.id}`}
                    title={slice.label}
                    className={linkClass}
                  >
                    {slice.label}
                  </Link>
                ) : (
                  <span
                    title={slice.label}
                    className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] text-ink"
                  >
                    {slice.label}
                  </span>
                )}
                {figures}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

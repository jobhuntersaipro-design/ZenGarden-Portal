"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { PoStage } from "@/generated/prisma/enums";
import { StackedStageChart } from "@/components/dashboard/StackedStageChart";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { SegmentGroup } from "@/components/portal/SegmentGroup";
import { usePendingChoice } from "@/hooks/usePendingChoice";
import { useEdgeFades } from "@/hooks/useEdgeFades";
import { PO_STAGES, stageLabel } from "@/lib/po-stages";
import { STAGE_VARS, cssVar } from "@/lib/analytics/palette";
import { NO_PRODUCT, type StageProductRow } from "@/lib/analytics/stage-products";
import { STAGE_WINDOWS, type StageWindow } from "@/lib/po-stage-window";
import type { StagePoint } from "@/lib/analytics/fulfillment";
import type { StageBreakdown } from "@/lib/analytics/fulfillment";

const num = (value: number) => value.toLocaleString("en-MY");

/** Nothing counted is a dash, not a zero — the rule the whole portal reads by. */
function Cell({ value }: { value: number }) {
  return value === 0 ? <span className="text-ink-disabled">—</span> : <>{num(value)}</>;
}

/**
 * Where the purchase orders of the last N days stand, and what they carry.
 *
 * **The table is the bar's own breakdown, and that is the whole design.** The
 * chart answers how many orders and at which stage; a planner reading a tall
 * bar immediately asks what is in it, and a tooltip cannot answer that — it
 * holds six numbers about stages and nothing about products. Hovering a bar
 * puts that day's orders in the table below, one row per product; moving off
 * puts the whole window back.
 *
 * **A tap pins**, because a phone has no hover. Tapping the same bar again
 * releases it, and the caption always says which it is showing, so the table
 * can never be a day's figures under a window's heading.
 *
 * An order counts once per product it carries, so the stage columns add up to
 * more than the window's order count. The caption says so rather than leaving
 * a reader to add the column and find it disagrees with the bar.
 */
export function StageBoard({
  points,
  breakdown,
  all,
  byBucket,
  orderCount,
  window,
  from,
  to,
}: {
  points: StagePoint[];
  breakdown: StageBreakdown;
  all: StageProductRow[];
  byBucket: Record<string, StageProductRow[]>;
  orderCount: number;
  window: StageWindow;
  from: string;
  to: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const windows = usePendingChoice<StageWindow>(window);

  // Written against the page it is on, keeping everything else in the URL.
  // A hardcoded path would send a reader somewhere else entirely, and
  // replacing the query string would drop the grain, span and filters the
  // board above it is drawn from.
  const windowHref = (value: StageWindow) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("stage_window", value);
    return `${pathname}?${params.toString()}`;
  };
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const { ref, clipped, measure } = useEdgeFades<HTMLDivElement>();

  const active = pinned ?? hovered;
  const point = active ? points.find((p) => p.key === active) : undefined;
  const rows = useMemo(
    () => (active ? (byBucket[active] ?? []) : all),
    [active, byBucket, all],
  );

  // Tapping the bar already shown releases it, so a phone can get back to
  // the whole window without hunting for the link that says so.
  const toggle = (key: string) =>
    setPinned((current) => (current === key ? null : key));

  return (
    <section className="mb-lg rounded-xl bg-surface p-lg sm:p-xl">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Order stage
          </p>
          <h2 className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink">
            {orderCount === 0 ? (
              "No orders in this window"
            ) : (
              <>
                {num(orderCount)}{" "}
                {orderCount === 1 ? "order" : "orders"} in the last {window} days
              </>
            )}
          </h2>
          <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
            Where each day&apos;s orders stand today · hover or tap a bar for
            the products behind it
          </p>
        </div>

        <SegmentGroup label="Window" busy={windows.pending}>
          {STAGE_WINDOWS.map((value) => (
            <ChoiceButton
              key={value}
              look="segment"
              selected={windows.value === value}
              pending={windows.isPending(value)}
              dimmed={windows.pending && !windows.isPending(value)}
              onClick={() =>
                windows.choose(value, windowHref(value))
              }
            >
              {value} days
            </ChoiceButton>
          ))}
        </SegmentGroup>
      </div>

      <div className="mt-lg">
        <StackedStageChart
          points={points}
          onActive={setHovered}
          activeKey={active}
          onPick={toggle}
          showTooltip={false}
        />
      </div>

      {/* The legend, and the way into the rows each count is over. */}
      <ul className="mt-md flex flex-wrap gap-x-md gap-y-xs">
        {breakdown.map((entry) => (
          <li key={entry.stage}>
            <Link
              href={`/purchase-orders?status=confirmed&stage=${entry.stage}&from=${from}&to=${to}`}
              className="flex items-center gap-xxs text-[length:var(--text-caption)] text-ink-secondary hover:text-ink"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{
                  background: cssVar(
                    STAGE_VARS[PO_STAGES.indexOf(entry.stage)],
                  ),
                }}
              />
              {stageLabel(entry.stage)}{" "}
              <span className="tabular-nums text-ink">{num(entry.count)}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-lg border-t border-hairline pt-lg">
        <div className="flex flex-wrap items-baseline justify-between gap-xs">
          <h3 className="text-[length:var(--text-body-md)] font-medium text-ink">
            {point ? point.label : `The last ${window} days`}
          </h3>
          {pinned ? (
            <button
              type="button"
              onClick={() => setPinned(null)}
              className="h-control-md sm:h-auto text-[length:var(--text-caption)] text-brand-link underline-offset-2 hover:underline"
            >
              Show the whole window
            </button>
          ) : null}
        </div>
        <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
          {rows.length === 0
            ? "Nothing ordered here."
            : "One row per product. An order carrying three products counts under each, so a column totals more orders than there are."}
        </p>

        {rows.length > 0 ? (
          <div className="relative mt-sm">
            <div
              ref={ref}
              onScroll={measure}
              className="overflow-x-auto"
            >
              <table className="w-full min-w-stage-table border-collapse text-[length:var(--text-body-sm)]">
                <thead>
                  <tr className="border-b border-hairline text-left">
                    <th
                      scope="col"
                      className="py-xs pr-sm font-medium text-ink-secondary"
                    >
                      Product
                    </th>
                    {PO_STAGES.map((stage) => (
                      <th
                        key={stage}
                        scope="col"
                        className="py-xs pl-sm text-right font-medium text-ink-secondary"
                      >
                        {stageLabel(stage)}
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="py-xs pl-sm text-right font-medium text-ink-secondary"
                    >
                      Orders
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.productId} className="border-b border-hairline">
                      <th
                        scope="row"
                        className="max-w-72 truncate py-xs pr-sm text-left font-normal text-ink"
                        title={row.productName}
                      >
                        {row.productId === NO_PRODUCT ? (
                          <span className="text-ink-tertiary">
                            {row.productName}
                          </span>
                        ) : (
                          <Link
                            href={`/products/${row.productId}`}
                            className="hover:underline"
                          >
                            {row.productName}
                          </Link>
                        )}
                      </th>
                      {PO_STAGES.map((stage) => (
                        <td
                          key={stage}
                          className="py-xs pl-sm text-right tabular-nums text-ink"
                        >
                          <Cell value={row[stage as PoStage]} />
                        </td>
                      ))}
                      <td className="py-xs pl-sm text-right font-medium tabular-nums text-ink">
                        {num(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {clipped.left ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-xl bg-linear-to-r from-surface to-transparent"
              />
            ) : null}
            {clipped.right ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-xl bg-linear-to-l from-surface to-transparent"
              />
            ) : null}
          </div>
        ) : null}
      </div>

    </section>
  );
}

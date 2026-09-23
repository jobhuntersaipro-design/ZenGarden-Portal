"use client";

import { differenceInCalendarDays, parseISO } from "date-fns";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { StackedStageChart } from "@/components/dashboard/StackedStageChart";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { SegmentGroup } from "@/components/portal/SegmentGroup";
import { StageBadge } from "@/components/portal/StatusBadge";
import { usePendingChoice } from "@/hooks/usePendingChoice";
import { useEdgeFades } from "@/hooks/useEdgeFades";
import { PoStage } from "@/generated/prisma/enums";
import { PO_STAGES, stageLabel } from "@/lib/po-stages";
import { STAGE_VARS, cssVar } from "@/lib/analytics/palette";
import { pointBreakdown } from "@/lib/analytics/stage-history";
import type {
  StageSplitBreakdown,
  StageSplitPoint,
} from "@/lib/analytics/stage-history";
import {
  NO_PRODUCT,
  type StageProductOrder,
  type StageProductRow,
} from "@/lib/analytics/stage-products";
import type { StageOrderMeta } from "@/lib/queries/po-stages";
import type { StageShowParam } from "@/lib/po-stage-window";
import type { DemandGrain } from "@/lib/planning/grain";

/**
 * The five stages an open order can stand at. Delivered is absent because a
 * delivered order is off the board — it is finished work, not work in hand —
 * so drawing it would be a segment and a legend row pinned at zero.
 */
const OPEN_STAGES = PO_STAGES.filter((stage) => stage !== PoStage.DELIVERED);

const num = (value: number) => value.toLocaleString("en-MY");

/** What one bar covers, for the caption. */
const PERIOD: Record<DemandGrain, string> = {
  day: "day",
  week: "week",
  month: "month",
};

/** Nothing counted is a dash, not a zero — the rule the whole portal reads by. */
function Cell({ value }: { value: number }) {
  return value === 0 ? (
    <span className="text-ink-disabled">—</span>
  ) : (
    <>{num(value)}</>
  );
}

/**
 * How late, or how soon, on the day being read.
 *
 * Measured to the bucket's own day rather than to today, like everything else
 * on this board: a sub-row under the 15 Sep bar has to say how late that
 * order was *on the 15th*.
 */
function dueCaption(deliveryIso: string, day: string): {
  text: string;
  late: boolean;
} {
  const days = differenceInCalendarDays(parseISO(day), parseISO(deliveryIso));
  if (days > 0) return { text: `${days} day${days === 1 ? "" : "s"} late`, late: true };
  if (days === 0) return { text: "due that day", late: false };
  return { text: `due in ${-days} day${days === -1 ? "" : "s"}`, late: false };
}

/**
 * Where the purchase orders of the last N days stand, what they carry, and
 * which of them are late.
 *
 * **The table is the bar's own breakdown, and that is the whole design.** The
 * chart answers how many orders and at which stage; a planner reading a tall
 * bar immediately asks what is in it, and a tooltip cannot answer that — it
 * holds six numbers about stages and nothing about products. Hovering a bar
 * puts that day's orders in the table below, one row per product; moving off
 * puts the whole window back.
 *
 * **Lateness is drawn at the stage that owns it.** Each stage's band splits
 * into a solid share and a hatched one, so an overdue order is readable
 * *where it is stuck* — four late orders nobody has started is a different
 * problem from four late orders already on a lorry, and a single "12 overdue"
 * cannot tell them apart.
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
  orders,
  orderCount,
  overdueCount,
  openCount,
  show,
  grain,
}: {
  points: StageSplitPoint[];
  breakdown: StageSplitBreakdown;
  all: StageProductRow[];
  byBucket: Record<string, StageProductRow[]>;
  orders: Record<string, StageOrderMeta>;
  orderCount: number;
  overdueCount: number;
  openCount: number;
  show: StageShowParam;
  grain: DemandGrain;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shows = usePendingChoice<StageShowParam>(show);

  // Written against the page it is on, keeping everything else in the URL.
  // A hardcoded path would send a reader somewhere else entirely, and
  // replacing the query string would drop the grain, span and filters the
  // board above it is drawn from.
  const hrefFor = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    return `${pathname}?${params.toString()}`;
  };
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const { ref, clipped, measure } = useEdgeFades<HTMLDivElement>();
  const tableRef = useRef<HTMLDivElement>(null);

  const active = pinned ?? hovered;
  const point = active ? points.find((p) => p.key === active) : undefined;
  const rows = useMemo(
    () => (active ? (byBucket[active] ?? []) : all),
    [active, byBucket, all],
  );

  // **The legend counts the bar being read, not today.** A reader who pins
  // 20 Sep and finds six counts from this morning underneath it has been
  // shown the wrong figures under the right heading — the exact defect the
  // board was rebuilt to remove, arriving one component lower.
  const legend = useMemo<StageSplitBreakdown>(
    () => (point ? pointBreakdown(point) : breakdown),
    [point, breakdown],
  );
  // Every figure in the table's half follows the same bar the legend does.
  const shownDay = point?.day ?? points.at(-1)?.day ?? null;
  const shownTotal = point ? point.total : orderCount;
  const shownLate = point ? point.lateTotal : overdueCount;
  const anyOverdue = show === "overdue" || points.some((p) => p.lateTotal > 0);

  // Tapping the bar already shown releases it, so a phone can get back to
  // the whole window without hunting for the link that says so.
  const toggle = (key: string) =>
    setPinned((current) => (current === key ? null : key));

  /**
   * A click anywhere else puts the board back to today.
   *
   * A pinned day is a temporary reading, and leaving it pinned because
   * nobody found the release is how a reader ends up studying last Tuesday
   * believing it is now. Two places are deliberately exempt: a **bar**, which
   * owns the choice through its own handler and must still toggle itself off
   * on a second tap; and the **breakdown below**, which is the pinned bar's
   * own table — expanding a row there cannot be allowed to change what the
   * row is a breakdown *of*, under the reader's hand.
   *
   * On `click` rather than `pointerdown`, because React's own handler fires
   * on the way up: clearing at pointer-down would unpin, let the bar's click
   * re-pin, and leave a second tap unable ever to release.
   */
  useEffect(() => {
    if (!pinned) return;
    const release = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
      } else {
        const target = event.target as Element | null;
        if (!target?.isConnected) return;
        if (target.closest(".recharts-bar-rectangle")) return;
        if (tableRef.current?.contains(target)) return;
      }
      setPinned(null);
      setHovered(null);
      setOpen(null);
    };
    document.addEventListener("click", release);
    document.addEventListener("keydown", release);
    return () => {
      document.removeEventListener("click", release);
      document.removeEventListener("keydown", release);
    };
  }, [pinned]);

  const columns = OPEN_STAGES.length + (anyOverdue ? 2 : 1) + 1;

  return (
    <section className="mb-lg rounded-xl bg-surface p-lg sm:p-xl">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Order stage
          </p>
          <h2 className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink">
            {/* Under the filter the late orders *are* the subject, so the
                heading leads with them rather than burying them in a clause
                after a figure the board is no longer drawing. */}
            {show === "overdue" ? (
              orderCount === 0 ? (
                "Nothing is overdue"
              ) : (
                <>
                  <span className="text-accent-red">
                    {num(orderCount)} overdue
                  </span>{" "}
                  of {num(openCount)} in hand
                </>
              )
            ) : orderCount === 0 ? (
              "Nothing open right now"
            ) : (
              <>
                {num(orderCount)} {orderCount === 1 ? "order" : "orders"} in
                hand
                {overdueCount > 0 ? (
                  <span className="text-accent-red">
                    {" · "}
                    {num(overdueCount)} overdue
                  </span>
                ) : null}
              </>
            )}
          </h2>
          <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
            {/* The grain is the toolbar's, so the caption names what the bars
                are rather than always saying "day". */}
            Where every open order stood at the end of each {PERIOD[grain]} ·
            hover or tap a bar for the products behind it
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-md">
          <SegmentGroup label="Show" busy={shows.pending}>
            {(
              [
                ["all", "All open"],
                ["overdue", "Overdue only"],
              ] as const
            ).map(([value, label]) => (
              <ChoiceButton
                key={value}
                look="segment"
                selected={shows.value === value}
                pending={shows.isPending(value)}
                dimmed={shows.pending && !shows.isPending(value)}
                onClick={() => shows.choose(value, hrefFor("stage_show", value))}
              >
                {label}
              </ChoiceButton>
            ))}
          </SegmentGroup>
        </div>
      </div>

      <div className="mt-lg">
        <StackedStageChart
          points={points}
          onActive={setHovered}
          activeKey={active}
          stages={[...OPEN_STAGES].reverse()}
          onPick={toggle}
          showTooltip={false}
        />
      </div>

      {/* The legend, and the way into the rows each count is over.
          Each row carries its late share, because "In production 7" and
          "In production 7 · 3 late" are different facts and only the second
          one is worth acting on.

          It links only at rest, and that is a limit of the list rather than
          a choice. "Every order at QC passed now" is a page the purchase-order
          list can draw; "every order at QC passed on 20 Sep" is not — that
          list filters the `stage` column, which holds today's stage and no
          history — so a pinned day prints plain text rather than a link that
          quietly answers a different question. */}
      <ul className="mt-md flex flex-wrap gap-x-md gap-y-xs">
        {legend.map((entry) => {
          const body = (
            <>
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
              {entry.late > 0 && show !== "overdue" ? (
                <span className="tabular-nums font-medium text-accent-red">
                  {num(entry.late)} late
                </span>
              ) : null}
            </>
          );
          const shape =
            "flex items-center gap-xxs text-[length:var(--text-caption)] text-ink-secondary";
          return (
            <li key={entry.stage}>
              {point ? (
                <span className={shape}>{body}</span>
              ) : (
                <Link
                  href={`/purchase-orders?status=confirmed&stage=${entry.stage}`}
                  className={`${shape} hover:text-ink`}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <div ref={tableRef} className="mt-lg border-t border-hairline pt-lg">
        <div className="flex flex-wrap items-baseline justify-between gap-xs">
          <h3 className="text-[length:var(--text-body-md)] font-medium text-ink">
            {/* The order count sits in the heading, next to the day it is
                for: the rows below count *products*, and a reader who reads
                the figures before the caption would otherwise have a column
                adding to 85 with no 24 anywhere near it to reconcile against. */}
            {point ? point.label : show === "overdue" ? "Overdue today" : "In hand today"}
            {" · "}
            <span className="tabular-nums font-normal text-ink-secondary">
              {num(shownTotal)} {shownTotal === 1 ? "order" : "orders"}
            </span>
            {show !== "overdue" && shownLate > 0 ? (
              <span className="tabular-nums font-normal text-accent-red">
                {" · "}
                {num(shownLate)} overdue
              </span>
            ) : null}
          </h3>
          {pinned ? (
            <button
              type="button"
              onClick={() => setPinned(null)}
              className="h-control-md sm:h-auto text-[length:var(--text-caption)] text-brand-link underline-offset-2 hover:underline"
            >
              Back to today
            </button>
          ) : null}
        </div>
        <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
          {rows.length === 0
            ? show === "overdue"
              ? "Nothing was overdue that day."
              : "Nothing was open that day."
            : "One row per product — open one for the orders behind it. An order carrying three products counts under each, so a column totals more than the order count above."}
        </p>

        {rows.length > 0 ? (
          <div className="relative mt-sm">
            <div ref={ref} onScroll={measure} className="overflow-x-auto">
              <table className="w-full min-w-stage-table border-collapse text-[length:var(--text-body-sm)]">
                <thead>
                  <tr className="border-b border-hairline text-left">
                    <th
                      scope="col"
                      className="py-xs pr-sm font-medium text-ink-secondary"
                    >
                      Product
                    </th>
                    {anyOverdue ? (
                      <th
                        scope="col"
                        className="py-xs pl-sm text-right font-medium text-accent-red"
                      >
                        Overdue
                      </th>
                    ) : null}
                    {OPEN_STAGES.map((stage) => (
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
                    <ProductRows
                      key={row.productId}
                      row={row}
                      orders={orders}
                      day={shownDay}
                      anyOverdue={anyOverdue}
                      open={open === row.productId}
                      onToggle={() =>
                        setOpen((current) =>
                          current === row.productId ? null : row.productId,
                        )
                      }
                      columns={columns}
                    />
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

/**
 * A product's row, and — once opened — the orders behind it.
 *
 * The sub-rows are what makes the row's own figures checkable: one per order,
 * each putting a 1 in the stage column its parent counted it in, so the
 * expansion sums to the row above it rather than merely accompanying it.
 * That is the same shape the demand board's breakdown uses, and for the same
 * reason — the addition lands under the figure it explains.
 */
function ProductRows({
  row,
  orders,
  day,
  anyOverdue,
  open,
  onToggle,
  columns,
}: {
  row: StageProductRow;
  orders: Record<string, StageOrderMeta>;
  day: string | null;
  anyOverdue: boolean;
  open: boolean;
  onToggle: () => void;
  columns: number;
}) {
  const named = row.productId === NO_PRODUCT ? null : row.productId;
  return (
    <>
      <tr className="border-b border-hairline">
        <th
          scope="row"
          className="max-w-72 py-xs pr-sm text-left font-normal text-ink"
        >
          <div className="flex items-center gap-xxs">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              className="grid size-control-md shrink-0 place-items-center rounded-xxs text-ink-tertiary hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:size-6"
            >
              <span aria-hidden className="text-[10px]">
                {open ? "▼" : "▶"}
              </span>
              <span className="sr-only">
                {open ? "Hide" : "Show"} the {row.total} order
                {row.total === 1 ? "" : "s"} behind {row.productName}
              </span>
            </button>
            <span className="truncate" title={row.productName}>
              {named ? (
                <Link href={`/products/${named}`} className="hover:underline">
                  {row.productName}
                </Link>
              ) : (
                <span className="text-ink-tertiary">{row.productName}</span>
              )}
            </span>
          </div>
        </th>
        {anyOverdue ? (
          <td className="py-xs pl-sm text-right font-medium tabular-nums text-accent-red">
            <Cell value={row.overdue} />
          </td>
        ) : null}
        {OPEN_STAGES.map((stage) => (
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
      {open
        ? row.orders.map((entry) => (
            <OrderRow
              key={entry.id}
              entry={entry}
              meta={orders[entry.id]}
              day={day}
              anyOverdue={anyOverdue}
            />
          ))
        : null}
      {open && row.orders.length === 0 ? (
        <tr className="border-b border-hairline bg-surface-soft/40">
          <td
            colSpan={columns}
            className="py-sm pl-xl text-[length:var(--text-caption)] text-ink-tertiary"
          >
            No orders behind this row.
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * One order under a product row, in the same columns as the total above it.
 *
 * **Both identifiers, one per line.** The buyer's `PO number …` leads and is
 * the link, because that is what a planner quotes when they chase the order;
 * our `Order ID W-…` sits under it where the order has one. They are on
 * separate lines rather than joined by a `·`, because a reader copying the
 * pair out of a row would have to cut it in half before either half is
 * usable. The buyer's name is what gives way instead, with the full value in
 * `title` — 00-master §4's truncation-recovery rule.
 */
function OrderRow({
  entry,
  meta,
  day,
  anyOverdue,
}: {
  entry: StageProductOrder;
  meta: StageOrderMeta | undefined;
  day: string | null;
  anyOverdue: boolean;
}) {
  if (!meta) return null;
  const due =
    meta.deliveryIso && day ? dueCaption(meta.deliveryIso, day) : null;

  return (
    <tr className="border-b border-hairline bg-surface-soft/40">
      <th scope="row" className="max-w-72 py-sm pr-sm text-left font-normal">
        <div className="flex flex-col gap-0 pl-[calc(var(--spacing-xxs)+var(--spacing-control-md))] sm:pl-xl">
          <span className="truncate text-ink" title={meta.buyerName}>
            {meta.buyerName}
          </span>
          <Link
            href={`/purchase-orders/${meta.purchaseOrderId}`}
            className="whitespace-nowrap text-[length:var(--text-caption)] font-medium text-ink-secondary hover:text-brand-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {meta.label}
          </Link>
          {/* Absent rather than dashed where the order has none: a scanned
              purchase order was never given an Order ID, so a dash on every
              sub-row of a scan-only board would be a fact about nothing
              repeated down the whole table. */}
          {meta.orderIdLabel ? (
            <span className="whitespace-nowrap text-[length:var(--text-caption)] text-ink-tertiary">
              {meta.orderIdLabel}
            </span>
          ) : null}
          <span className="flex flex-wrap items-center gap-x-xxs text-[length:var(--text-caption)] text-ink-tertiary">
            <span className="whitespace-nowrap">
              {meta.deliveryDate ? `Expected ${meta.deliveryDate}` : "No expected date"}
            </span>
            {due ? (
              <span
                className={`whitespace-nowrap${due.late ? " font-medium text-accent-red" : ""}`}
              >
                {" · "}
                {due.text}
              </span>
            ) : null}
          </span>
          <span className="mt-xxs">
            <StageBadge stage={entry.stage} state="done" compact />
          </span>
        </div>
      </th>
      {anyOverdue ? (
        <td className="py-sm pl-sm text-right font-medium tabular-nums text-accent-red">
          {entry.overdue ? 1 : <span className="text-ink-disabled">—</span>}
        </td>
      ) : null}
      {OPEN_STAGES.map((stage) => (
        <td key={stage} className="py-sm pl-sm text-right tabular-nums text-ink">
          {entry.stage === stage ? 1 : <span className="text-ink-disabled">—</span>}
        </td>
      ))}
      <td className="py-sm pl-sm text-right font-medium tabular-nums text-ink">
        1
      </td>
    </tr>
  );
}

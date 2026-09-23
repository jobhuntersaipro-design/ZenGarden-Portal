import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/portal/PageHeader";
import { DemandTable } from "@/components/demand/DemandTable";
import { DemandToolbar } from "@/components/demand/DemandToolbar";
import { PrintBoard } from "@/components/demand/PrintBoard";
import { StageBoard } from "@/components/demand/StageBoard";
import {
  lastPickableDate,
  loadDemandBoard,
  windowUntil,
  type DemandWindow,
} from "@/lib/queries/demand";
import { DEMAND_CEILING, DEMAND_SPAN, type DemandGrain } from "@/lib/planning/grain";
import { firstParam, type SearchParams } from "@/lib/queries/pagination";
import { loadPoStageBoard } from "@/lib/queries/po-stages";
import { resolveStageShow } from "@/lib/po-stage-window";

export const metadata: Metadata = { title: "Demand Board · Zen Garden Portal" };
export const dynamic = "force-dynamic";

/**
 * The spans each grain offers as a chip. The three cannot share one list:
 * thirty weeks of days is most of a year, and six days is not a question
 * anybody asks a month view, so each grain gets the two spans a person would
 * actually ask it for, plus every open order.
 *
 * Anything else is a **date**, not a longer list of chips: a planner knows
 * they need to see through the end of the quarter, and does not know that is
 * 187 days. `?until=` carries it, and `?window=` still works for a link
 * written before it.
 */
const SPANS: Record<DemandGrain, { value: string; label: string }[]> = {
  month: [
    { value: "6", label: "Next 6 months" },
    { value: "12", label: "Next 12" },
    { value: "all", label: "All open" },
  ],
  week: [
    { value: "4", label: "Next 4 weeks" },
    { value: "12", label: "Next 12" },
    { value: "all", label: "All open" },
  ],
  day: [
    { value: "30", label: "Next 30 days" },
    { value: "60", label: "Next 60 days" },
    { value: "all", label: "All open" },
  ],
};

/**
 * Daily is the default, and the window follows it: `DEMAND_SPAN.day` is 30, so
 * a board opened with no query string draws the next 30 days. A grain the URL
 * does not name falls back here rather than drawing nothing.
 */
function parseGrain(raw: string | undefined): DemandGrain {
  return raw === "week" || raw === "month" ? raw : "day";
}

/**
 * What the board is showing, resolved once so the toolbar cannot disagree
 * with it.
 *
 * The toolbar renders `until` from what came back here rather than from the
 * URL, which is what keeps a refused date out of the picker: a board that
 * fell back to Next 30 days shows an empty date field and the chip that is
 * actually selected, instead of a date it is not drawing.
 *
 * `until` wins over `window` where a link carries both, because it is the
 * one the planner chose most recently — every control that writes one clears
 * the other.
 */
function resolveWindow(
  params: SearchParams,
  grain: DemandGrain,
): { window: DemandWindow; until: string } {
  const until = firstParam(params, "until") ?? "";
  if (until) {
    const span = windowUntil(until, grain);
    if (span !== null) return { window: span, until };
  }

  const raw = firstParam(params, "window");
  if (raw === "all") return { window: "all", until: "" };
  const span = Number(raw);
  // A span past the ceiling is refused rather than clamped: a silently
  // corrected 900 would look like the board answered the question asked.
  return {
    window:
      Number.isInteger(span) && span > 0 && span <= DEMAND_CEILING[grain]
        ? span
        : DEMAND_SPAN[grain],
    until: "",
  };
}

export default async function DemandPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const grain = parseGrain(firstParam(params, "by"));
  const { window, until } = resolveWindow(params, grain);
  const filters = {
    q: firstParam(params, "q") ?? "",
    family: firstParam(params, "family") ?? "",
    productId: firstParam(params, "product") ?? "",
  };
  // **The whole toolbar drives the stage board now**, grain and window
  // included — it sits directly under those controls, and one that governed
  // the table two sections down while leaving the chart beneath it untouched
  // would be broken on its face.
  //
  // The window is read as a **span rather than a direction**: the committed
  // board projects it forward from today and the stage board replays the
  // same span backward, at the same grain. That is the only reading that
  // composes — a snapshot of what *has* happened cannot be drawn into next
  // March, and every future bar would simply repeat today.
  //
  // `stage_show` stays the board's own, because nothing above it asks that
  // question.
  const stageShow = resolveStageShow(firstParam(params, "stage_show"));

  const [board, stages] = await Promise.all([
    loadDemandBoard({ grain, window, filters }),
    loadPoStageBoard({ grain, periods: window, show: stageShow, filters }),
  ]);

  // A picked date owns the strip: no chip is selected beside it, the same as
  // a hand-typed span outside the two the chips offer.
  const selected = until ? "" : window === "all" ? "all" : String(window);
  const narrowed = Boolean(filters.q || filters.family || filters.productId);

  return (
    /* Everything inside prints; the toolbar and the button take themselves
       out. The heading and the summary line stay, because a board on paper
       with no window and no total is a grid of numbers nobody can place. */
    <div className="page-enter" data-print-region>
      <PageHeader
        eyebrow="Planning"
        title="What is committed"
        action={<PrintBoard />}
      />

      <p className="-mt-sm mb-lg text-[length:var(--text-body-sm)] text-ink-secondary">
        {board.openOrders === 0
          ? narrowed
            ? "Nothing on the board matches that. Clear the search or the filters to see every open order."
            : "No open orders carry an expected delivery date, so there is nothing to plan against yet."
          : `${board.openOrders} open order${board.openOrders === 1 ? "" : "s"} · ${board.totals.committed.toLocaleString("en-MY")} cartons · ${narrowed ? "every figure below counts only what matches." : "every figure comes from orders already in the portal."}`}
      </p>

      <div className="mb-lg" data-print-hide>
        <DemandToolbar
          grain={grain}
          window={selected}
          spans={SPANS[grain]}
          until={until}
          lastDate={lastPickableDate(grain)}
          families={board.families}
          products={board.products}
        />
      </div>

      {/* Directly under the toolbar, because the toolbar governs it: the
          same search, family and product narrow this board and the committed
          table below it, so the control and what it changes are adjacent.
          `data-print-hide` because the printed sheet is the committed board —
          `PrintBoard` scales the page to *that* table's width, so a second
          scroller would print cut off, and a stage chart is not what somebody
          carries into a planning meeting. */}
      <div className="mb-xl" data-print-hide>
        <StageBoard
          points={stages.points}
          breakdown={stages.breakdown}
          all={stages.all}
          byBucket={stages.byBucket}
          orders={stages.orders}
          orderCount={stages.orderCount}
          overdueCount={stages.overdueCount}
          openCount={stages.openCount}
          show={stages.show}
          grain={stages.grain}
        />
      </div>

      {/* The board's own missing half, said once and plainly rather than
          implied by a column of dashes. `counted` is how many products on the
          board carry a figure at all. */}
      {board.counted === 0 && board.rows.length > 0 ? (
        <div className="mb-lg rounded-sm border border-brand-amber bg-surface-warning p-md">
          <p className="text-[length:var(--text-body-sm)] text-ink">
            <strong className="font-semibold">Stock is not counted yet.</strong>{" "}
            Committed is exact — it is read from the orders. Stock count and
            Short by stay blank until somebody enters a count.
          </p>
          <Link
            href="/stock"
            className="mt-xs inline-block text-[length:var(--text-body-sm)] font-medium text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Enter stock counts →
          </Link>
        </div>
      ) : null}

      <DemandTable board={board} />

    </div>
  );
}

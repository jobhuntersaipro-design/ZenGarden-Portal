import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/portal/PageHeader";
import { DemandTable } from "@/components/demand/DemandTable";
import { DemandToolbar } from "@/components/demand/DemandToolbar";
import {
  lastPickableDate,
  loadDemandBoard,
  windowUntil,
  type DemandWindow,
} from "@/lib/queries/demand";
import { DEMAND_CEILING, DEMAND_SPAN, type DemandGrain } from "@/lib/planning/grain";
import { firstParam, type SearchParams } from "@/lib/queries/pagination";

export const metadata: Metadata = { title: "Demand board · Zen Garden Portal" };
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

function parseGrain(raw: string | undefined): DemandGrain {
  return raw === "day" || raw === "month" ? raw : "week";
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
  const board = await loadDemandBoard({ grain, window, filters });

  // A picked date owns the strip: no chip is selected beside it, the same as
  // a hand-typed span outside the two the chips offer.
  const selected = until ? "" : window === "all" ? "all" : String(window);
  const narrowed = Boolean(filters.q || filters.family || filters.productId);

  return (
    <div className="page-enter">
      <PageHeader eyebrow="Planning" title="What is committed" />

      <p className="-mt-sm mb-lg text-[length:var(--text-body-sm)] text-ink-secondary">
        {board.openOrders === 0
          ? narrowed
            ? "Nothing on the board matches that. Clear the search or the filters to see every open order."
            : "No open orders carry an expected delivery date, so there is nothing to plan against yet."
          : `${board.openOrders} open order${board.openOrders === 1 ? "" : "s"} · ${board.totals.committed.toLocaleString("en-MY")} cartons · ${narrowed ? "every figure below counts only what matches." : "every figure comes from orders already in the portal."}`}
      </p>

      <div className="mb-lg">
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
            href="/products?filter=low-stock"
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

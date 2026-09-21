import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/portal/PageHeader";
import { DemandTable } from "@/components/demand/DemandTable";
import { DemandToolbar } from "@/components/demand/DemandToolbar";
import { loadDemandBoard, type DemandWindow } from "@/lib/queries/demand";
import { DEMAND_CEILING, DEMAND_SPAN, type DemandGrain } from "@/lib/planning/grain";
import { firstParam, type SearchParams } from "@/lib/queries/pagination";

export const metadata: Metadata = { title: "Demand board · Zen Garden Portal" };
export const dynamic = "force-dynamic";

/**
 * The spans each grain offers. The three cannot share one list: thirty weeks
 * of days is most of a year, and six days is not a question anybody asks a
 * month view, so each grain gets the two spans a person would actually ask
 * it for, plus every open order. A `?window=` outside them still works, up
 * to `DEMAND_CEILING` — the chips are the offer, not the limit.
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

function parseWindow(raw: string | undefined, grain: DemandGrain): DemandWindow {
  if (raw === "all") return "all";
  const span = Number(raw);
  // Any span the planner asks for, up to the point where a URL is a typo
  // rather than a question (`DEMAND_CEILING`). The old ceilings were a
  // fortnight-ish per grain and were the thing being complained about.
  return Number.isInteger(span) && span > 0 && span <= DEMAND_CEILING[grain]
    ? span
    : DEMAND_SPAN[grain];
}

export default async function DemandPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const grain = parseGrain(firstParam(params, "by"));
  const window = parseWindow(firstParam(params, "window"), grain);
  const filters = {
    q: firstParam(params, "q") ?? "",
    family: firstParam(params, "family") ?? "",
    productId: firstParam(params, "product") ?? "",
  };
  const board = await loadDemandBoard({ grain, window, filters });

  const selected = window === "all" ? "all" : String(window);
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

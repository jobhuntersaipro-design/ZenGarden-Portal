import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/portal/PageHeader";
import { DemandTable } from "@/components/demand/DemandTable";
import { DemandToolbar } from "@/components/demand/DemandToolbar";
import { loadDemandBoard, type DemandWindow } from "@/lib/queries/demand";
import { DEMAND_SPAN, type DemandGrain } from "@/lib/planning/grain";
import { firstParam, type SearchParams } from "@/lib/queries/pagination";

export const metadata: Metadata = { title: "Demand board · Zen Garden Portal" };
export const dynamic = "force-dynamic";

/**
 * The spans each grain offers. Days and weeks cannot share them: four weeks
 * of days is 28 columns, and fourteen weeks is half a year — each grain gets
 * the spans a person would actually ask it for.
 */
const SPANS: Record<DemandGrain, { value: string; label: string }[]> = {
  week: [
    { value: "4", label: "Next 4 weeks" },
    { value: "12", label: "Next 12" },
    { value: "all", label: "All open" },
  ],
  day: [
    { value: "7", label: "Next 7 days" },
    { value: "14", label: "Next 14" },
    { value: "all", label: "All open" },
  ],
};

function parseGrain(raw: string | undefined): DemandGrain {
  return raw === "day" ? "day" : "week";
}

function parseWindow(raw: string | undefined, grain: DemandGrain): DemandWindow {
  if (raw === "all") return "all";
  const span = Number(raw);
  // A day span may run to a quarter; a week span to a year. Both are bounded
  // so a typed `?window=9999` cannot ask for ten thousand columns.
  const ceiling = grain === "day" ? 92 : 52;
  return Number.isInteger(span) && span > 0 && span <= ceiling
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
  const board = await loadDemandBoard(grain, window);

  const selected = window === "all" ? "all" : String(window);

  return (
    <div className="page-enter">
      <PageHeader eyebrow="Planning" title="What is committed" />

      <p className="-mt-sm mb-lg text-[length:var(--text-body-sm)] text-ink-secondary">
        {board.openOrders === 0
          ? "No open orders carry an expected delivery date, so there is nothing to plan against yet."
          : `${board.openOrders} open order${board.openOrders === 1 ? "" : "s"} · ${board.totals.committed.toLocaleString("en-MY")} cartons · every figure comes from orders already in the portal.`}
      </p>

      <div className="mb-lg">
        <DemandToolbar grain={grain} window={selected} spans={SPANS[grain]} />
      </div>

      {/* The board's own missing half, said once and plainly rather than
          implied by a column of dashes. `counted` is how many products on the
          board carry a figure at all. */}
      {board.counted === 0 && board.rows.length > 0 ? (
        <div className="mb-lg rounded-sm border border-brand-amber bg-surface-warning p-md">
          <p className="text-[length:var(--text-body-sm)] text-ink">
            <strong className="font-semibold">Stock is not counted yet.</strong>{" "}
            Committed is exact — it is read from the orders. On hand and Short
            by stay blank until somebody enters a count.
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

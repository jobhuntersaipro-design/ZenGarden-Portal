import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/portal/PageHeader";
import { DemandTable } from "@/components/demand/DemandTable";
import { DemandToolbar } from "@/components/demand/DemandToolbar";
import {
  DEMAND_WEEKS,
  loadDemandBoard,
  type DemandWindow,
} from "@/lib/queries/demand";
import { firstParam, type SearchParams } from "@/lib/queries/pagination";

export const metadata: Metadata = { title: "Demand board · Zen Garden Portal" };
export const dynamic = "force-dynamic";

const WINDOWS = [
  { value: String(DEMAND_WEEKS), label: `Next ${DEMAND_WEEKS} weeks` },
  { value: "12", label: "Next 12" },
  { value: "all", label: "All open" },
] as const;

function parseWindow(raw: string | undefined): DemandWindow {
  if (raw === "all") return "all";
  const weeks = Number(raw);
  return Number.isInteger(weeks) && weeks > 0 && weeks <= 52 ? weeks : DEMAND_WEEKS;
}

export default async function DemandPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const raw = firstParam(params, "window");
  const window = parseWindow(raw);
  const board = await loadDemandBoard(window);

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
        <DemandToolbar
          value={selected}
          options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
        />
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

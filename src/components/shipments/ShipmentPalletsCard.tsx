"use client";

import { DonutChart } from "@/components/arc/donut-chart/donut-chart";
import type { LandStatus } from "@/components/shipments/ChecklistDots";
import { palletSplit } from "@/lib/pallets";

const count = (n: number) =>
  `${n.toLocaleString("en-MY")} ${n === 1 ? "pallet" : "pallets"}`;

/**
 * The pallets a land shipment has to move (2026-11-25): the orders' total,
 * what the trucks carry now, what has arrived and what is still to go. The
 * total is worked out from cartons and each product's cartons per pallet;
 * each truck's figure is typed on the Land delivery card, and they add up.
 */
export function ShipmentPalletsCard({
  total,
  unpalletedLines,
  trucks,
}: {
  total: number;
  unpalletedLines: number;
  trucks: { pallets: number | null; status: LandStatus }[];
}) {
  const split = palletSplit(total, trucks);
  const rows = [
    {
      key: "delivered",
      label: "Delivered",
      short: "Delivered",
      value: split.delivered,
      color: "var(--color-accent-green)",
      dot: "bg-accent-green",
    },
    {
      key: "truck",
      label: trucks.length > 1 ? "On the trucks now" : "On the truck now",
      short: "On truck",
      value: split.onTruck,
      color: "var(--color-mode-land)",
      dot: "bg-mode-land",
    },
    {
      key: "remaining",
      label: "Still to deliver",
      short: "To go",
      value: split.remaining,
      color: "var(--color-hairline-strong)",
      dot: "bg-hairline-strong",
    },
  ];

  return (
    <section className="min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Pallets
      </h2>
      {total === 0 ? (
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          No pallet count yet: none of these products has its cartons per pallet
          set.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-md sm:flex-row sm:items-center">
          <DonutChart
            label="Pallets on this shipment"
            data={rows
              .filter((r) => r.value > 0)
              .map(({ key, short, value, color }) => ({
                key,
                label: short,
                value,
                color,
              }))}
            totalLabel="Total"
            formatValue={count}
            formatCenter={(v) => v.toLocaleString("en-MY")}
            legend={false}
            size={168}
            className="w-donut shrink-0"
          />
          <dl className="flex w-full min-w-0 flex-col gap-xs text-[length:var(--text-body-sm)]">
            <div className="flex justify-between gap-sm border-b border-hairline pb-xs">
              <dt className="text-ink-secondary">Total to deliver</dt>
              <dd className="font-medium tabular-nums text-ink">
                {count(total)}
              </dd>
            </div>
            {rows.map((r) => (
              <div
                key={r.key}
                className="flex items-center justify-between gap-sm"
              >
                <dt className="flex items-center gap-xs text-ink-secondary">
                  <span
                    aria-hidden
                    className={`size-2 shrink-0 rounded-full ${r.dot}`}
                  />
                  {r.label}
                </dt>
                <dd className="tabular-nums text-ink">{count(r.value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {split.over > 0 ? (
        <p className="mt-sm text-[length:var(--text-caption)] text-accent-red">
          The trucks carry {count(split.over)} more than this shipment&apos;s
          total. Check the pallets on each truck.
        </p>
      ) : null}
      {split.onTruck + split.delivered === 0 && total > 0 ? (
        <p className="mt-sm text-[length:var(--text-caption)] text-ink-tertiary">
          {trucks.length
            ? "Set a truck's status to Delivering under Land delivery to see what is on the way."
            : "Add a truck under Land delivery to see what is on the way."}
        </p>
      ) : null}
      {unpalletedLines > 0 ? (
        <p className="mt-sm text-[length:var(--text-caption)] text-ink-tertiary">
          Not counted: {unpalletedLines}{" "}
          {unpalletedLines === 1
            ? "line has no cartons per pallet set on its product."
            : "lines have no cartons per pallet set on their products."}
        </p>
      ) : null}
    </section>
  );
}

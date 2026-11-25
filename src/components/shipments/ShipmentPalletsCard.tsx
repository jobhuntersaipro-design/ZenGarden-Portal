"use client";

import { DonutChart } from "@/components/arc/donut-chart/donut-chart";
import { palletSplit } from "@/lib/pallets";

const count = (n: number) =>
  `${n.toLocaleString("en-MY")} ${n === 1 ? "pallet" : "pallets"}`;

/**
 * The pallets a land shipment has to move (2026-11-25): the orders' total,
 * what the truck carries now, what has arrived and what is still to go. The
 * total is worked out from cartons and each product's cartons per pallet;
 * the truck's figure is typed on the Land delivery card.
 */
export function ShipmentPalletsCard({
  total,
  unpalletedLines,
  onTruck,
  delivered,
}: {
  total: number;
  unpalletedLines: number;
  onTruck: number | null;
  delivered: boolean;
}) {
  const split = palletSplit(total, onTruck, delivered);
  const rows = [
    {
      key: "delivered",
      label: "Delivered",
      value: split.delivered,
      color: "var(--color-accent-green)",
      dot: "bg-accent-green",
    },
    {
      key: "truck",
      label: "On the truck now",
      value: split.onTruck,
      color: "var(--color-mode-land)",
      dot: "bg-mode-land",
    },
    {
      key: "remaining",
      label: "Still to deliver",
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
              .map(({ key, label, value, color }) => ({
                key,
                label,
                value,
                color,
              }))}
            totalLabel="To deliver"
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
      {onTruck === null && total > 0 ? (
        <p className="mt-sm text-[length:var(--text-caption)] text-ink-tertiary">
          Type the pallets on this truck under Land delivery to see what is on
          the way.
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

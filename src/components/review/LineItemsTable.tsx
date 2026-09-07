"use client";

import { Trash2 } from "lucide-react";
import type { Dispatch } from "react";
import type { ComboboxOption } from "@/components/review/Combobox";
import type { DraftAction } from "@/components/review/draft-reducer";
import { Input } from "@/components/ui/input";
import { useEdgeFades } from "@/hooks/useEdgeFades";
import { formatMYR } from "@/lib/money";
import type { DraftLineItem } from "@/lib/validation/purchase-orders";

export type ProductOption = ComboboxOption & { unit: string | null };

/**
 * The one table in the app that does not sort: these rows are in the order they
 * appear on the customer's document, and that correspondence is what lets
 * someone check them against the page beside it (design reference §4).
 */
export function LineItemsTable({
  lineItems,
  products,
  dispatch,
}: {
  lineItems: DraftLineItem[];
  products: ProductOption[];
  dispatch: Dispatch<DraftAction>;
}) {
  // Seven columns need 840px and the review screen's form column is narrower
  // than that on every viewport, so this table always scrolls. A container that
  // clips with no visible edge does not look scrollable — it looks like a table
  // missing a column, which is exactly how it was reported.
  const { ref: scroller, clipped, measure } = useEdgeFades<HTMLDivElement>();

  return (
    <div>
      <div className="relative">
        <div ref={scroller} onScroll={measure} className="overflow-x-auto">
          <table className="w-full min-w-line-items border-collapse">
            {/* Widths declared once here rather than repeated on every row. Without
            them Description had no width at all and collapsed to whatever the
            other six columns left over — about 88px. */}
            <colgroup>
              <col className="min-w-60" />
              <col className="w-44" />
              <col className="w-20" />
              <col className="w-20" />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-10" />
            </colgroup>
            <thead>
              <tr className="border-b border-hairline text-left">
                {[
                  "Product Code",
                  "Description",
                  "Qty",
                  "Unit",
                  "Unit price",
                  "Amount",
                  "",
                ].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="py-sm pr-sm font-mono text-[length:var(--text-eyebrow)] font-normal text-ink-tertiary"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line, index) => (
                <tr key={index} className="border-b border-hairline align-top">
                  {/* The code leads: since Phase 11 it *is* the line's
                      identity — an existing one links, an unknown one creates —
                      so it is read and corrected before anything else. */}
                  <td className="py-sm pr-sm">
                    <Input
                      aria-label={`Product code, line ${index + 1}`}
                      placeholder="No code"
                      className="font-mono"
                      value={line.sku ?? ""}
                      title={line.sku || undefined}
                      onChange={(event) =>
                        dispatch({
                          type: "line",
                          index,
                          field: "sku",
                          value: event.target.value || null,
                        })
                      }
                    />
                    {/* What this code currently points at, so a reviewer can
                        see a wrong link without opening a picker. */}
                    <span className="mt-xxs block truncate text-[length:var(--text-caption)] text-ink-tertiary">
                      {line.productId
                        ? (products.find((p) => p.id === line.productId)?.label ??
                          "Linked")
                        : line.sku?.trim()
                          ? "New product"
                          : "No product"}
                    </span>
                  </td>
                  <td className="py-sm pr-sm">
                    <Input
                      aria-label={`Description, line ${index + 1}`}
                      value={line.description}
                      title={line.description || undefined}
                      onChange={(event) =>
                        dispatch({
                          type: "line",
                          index,
                          field: "description",
                          value: event.target.value,
                        })
                      }
                    />
                  </td>
                  <td className="w-24 py-sm pr-sm">
                    <Input
                      aria-label={`Quantity, line ${index + 1}`}
                      inputMode="decimal"
                      className="tabular-nums"
                      value={line.quantity}
                      onChange={(event) =>
                        dispatch({
                          type: "line",
                          index,
                          field: "quantity",
                          value: event.target.value,
                        })
                      }
                    />
                  </td>
                  <td className="w-24 py-sm pr-sm">
                    <Input
                      aria-label={`Unit, line ${index + 1}`}
                      value={line.unit ?? ""}
                      onChange={(event) =>
                        dispatch({
                          type: "line",
                          index,
                          field: "unit",
                          value: event.target.value || null,
                        })
                      }
                    />
                  </td>
                  <td className="w-32 py-sm pr-sm">
                    <Input
                      aria-label={`Unit price, line ${index + 1}`}
                      inputMode="decimal"
                      className="tabular-nums"
                      value={line.unitPrice}
                      onChange={(event) =>
                        dispatch({
                          type: "line",
                          index,
                          field: "unitPrice",
                          value: event.target.value,
                        })
                      }
                    />
                  </td>
                  <td className="w-32 py-sm pr-sm">
                    <div className="flex items-center gap-xxs">
                      <Input
                        aria-label={`Amount, line ${index + 1}`}
                        inputMode="decimal"
                        className="tabular-nums"
                        value={line.amount}
                        onChange={(event) =>
                          dispatch({
                            type: "line",
                            index,
                            field: "amount",
                            value: event.target.value,
                          })
                        }
                      />
                      {/* Says the amount is no longer following quantity × price. */}
                      {line.amountManual ? (
                        <span
                          title="Typed by hand — no longer recalculated"
                          aria-label="Amount typed by hand"
                          className="size-1.5 shrink-0 rounded-full bg-ink-tertiary"
                        />
                      ) : null}
                    </div>
                  </td>
                  <td className="py-sm">
                    <button
                      type="button"
                      aria-label={`Remove line ${index + 1}`}
                      disabled={lineItems.length === 1}
                      onClick={() => dispatch({ type: "removeLine", index })}
                      className="flex size-8 items-center justify-center rounded-sm text-ink-tertiary transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-40"
                    >
                      <Trash2
                        className="size-4"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Each fade appears only while there is something on that side to
            reach. */}
        {clipped.left ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-xl bg-linear-to-r from-canvas to-transparent"
          />
        ) : null}
        {clipped.right ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-xl bg-linear-to-l from-canvas to-transparent"
          />
        ) : null}
      </div>

      {/* Outside the scroller: it is an action on the list, not a column of
          it, and it should not drift sideways when the table scrolls. */}
      <button
        type="button"
        onClick={() => dispatch({ type: "addLine" })}
        className="mt-sm text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        + Add line
      </button>
    </div>
  );
}

/** Read-only echo of what the lines add up to, beside the entered subtotal. */
export function LineItemSum({ lineItems }: { lineItems: DraftLineItem[] }) {
  const sum = lineItems.reduce((total, line) => {
    const value = Number.parseFloat(line.amount);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
  return (
    <span className="tabular-nums text-[length:var(--text-caption)] text-ink-tertiary">
      Lines add up to {formatMYR(sum.toFixed(2))}
    </span>
  );
}

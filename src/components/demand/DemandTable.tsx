"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Scroller } from "@/components/demand/Scroller";
import { StageBadge } from "@/components/portal/StatusBadge";
import type { DemandBoard, DemandLine, DemandRow } from "@/lib/queries/demand";

const num = (value: number) => value.toLocaleString("en-MY");

/** A figure, or the dash that means "nothing here" rather than zero. */
function Cell({ value }: { value: number | undefined }) {
  return value === undefined || value === 0 ? (
    <span className="text-ink-disabled">—</span>
  ) : (
    <>{num(value)}</>
  );
}

/**
 * The runway list: one row per product, days, weeks or months across, most
 * committed first — and, on a click, what each of its figures is made of.
 *
 * Deliberately not `DataTable`. That component pages, sorts by URL and drops
 * to card mode on a phone, all of which this board would have to fight: the
 * columns are computed rather than declared, the row is only meaningful
 * read across, and there is nothing here to page through — the window is the
 * paging.
 *
 * **Why the breakdown expands in place rather than opening a panel.** A
 * planner reading `371` is asking two things at once — who wants it, and does
 * that add up — and only sub-rows in the same grid answer the second. The
 * numbers land in the same columns as the total above them, so the addition
 * is visible rather than promised. The cost is width: a stage, a date and a
 * link do not fit in a numeric column, so they live in the product column,
 * which is the one with room.
 *
 * On hand and Short by render as dashes until a stock count exists. They are
 * kept in the table rather than hidden so the shape of the answer is visible
 * before the data for it is: the point of the board is what runs out, and a
 * column quietly missing would not say that it is missing.
 */
export function DemandTable({ board }: { board: DemandBoard }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const toggle = (productId: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(productId)) next.add(productId);
      return next;
    });

  if (board.rows.length === 0) {
    return (
      <div className="rounded-lg border border-hairline bg-canvas p-xl text-center">
        <p className="text-[length:var(--text-body-md)] font-semibold text-ink">
          Nothing committed in this window
        </p>
        <p className="mt-xxs text-[length:var(--text-body-sm)] text-ink-secondary">
          An order counts here once it is confirmed, carries an expected
          delivery date and has not been delivered.
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-hairline bg-canvas">
      <Scroller>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline">
              <Th className="sticky left-0 z-10 bg-canvas pl-lg">Product</Th>
              {board.anyOverdue ? <Th numeric>Overdue</Th> : null}
              {board.columns.map((column) => (
                <Th key={column.key} numeric>
                  {column.label}
                </Th>
              ))}
              <Th numeric>Committed</Th>
              <Th numeric>Orders</Th>
              <Th numeric>On hand</Th>
              <Th numeric className="pr-lg">
                Short by
              </Th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row) => {
              const expanded = open.has(row.productId);
              return (
                <ProductRows
                  key={row.productId}
                  row={row}
                  board={board}
                  expanded={expanded}
                  onToggle={() => toggle(row.productId)}
                />
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink">
              <Th className="sticky left-0 z-10 bg-canvas pl-lg">Total cartons</Th>
              {board.anyOverdue ? (
                <Td numeric>
                  <span className="font-semibold text-ink">{num(board.totals.overdue)}</span>
                </Td>
              ) : null}
              {board.columns.map((column) => (
                <Td key={column.key} numeric>
                  <span className="font-semibold text-ink">
                    <Cell value={board.totals.byColumn[column.key]} />
                  </span>
                </Td>
              ))}
              <Td numeric>
                <span className="font-semibold text-ink">{num(board.totals.committed)}</span>
              </Td>
              <Td numeric />
              <Td numeric />
              <Td numeric className="pr-lg" />
            </tr>
          </tfoot>
        </table>
      </Scroller>
      <p className="border-t border-hairline px-lg py-sm text-[length:var(--text-caption)] text-ink-tertiary">
        Cartons wanted, by the {board.grain} their order is expected. A dash
        is nothing promised, not a zero. Open a product to see which orders
        its figures come from.
      </p>
    </section>
  );
}

/** A product's own row, and — when it is open — the orders behind it. */
function ProductRows({
  row,
  board,
  expanded,
  onToggle,
}: {
  row: DemandRow;
  board: DemandBoard;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b border-hairline last:border-0">
        <td className="sticky left-0 z-10 max-w-72 bg-canvas py-sm pl-lg pr-md">
          <div className="flex items-start gap-xs">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              // The count is in the name because the caret alone does not say
              // how much is behind it, and a screen reader gets no column.
              aria-label={`${expanded ? "Hide" : "Show"} the ${row.orders} order${row.orders === 1 ? "" : "s"} behind ${row.name}`}
              className="flex size-11 shrink-0 items-center justify-center rounded-sm text-ink-tertiary transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-focus sm:size-6"
            >
              <ChevronRight
                className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`}
                strokeWidth={2}
                aria-hidden
              />
            </button>
            <div className="min-w-0">
              <Link
                href={`/products/${row.productId}`}
                className="block truncate text-[length:var(--text-body-sm)] font-semibold text-ink hover:text-brand-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                title={row.name}
              >
                {row.name}
              </Link>
              <p className="truncate font-mono text-[length:var(--text-caption)] text-ink-tertiary">
                {row.sku}
                {row.market ? ` · ${row.market}` : ""}
              </p>
            </div>
          </div>
        </td>
        {board.anyOverdue ? (
          <Td numeric>
            {row.overdue > 0 ? (
              <span className="font-semibold text-accent-red">{num(row.overdue)}</span>
            ) : (
              <span className="text-ink-disabled">—</span>
            )}
          </Td>
        ) : null}
        {board.columns.map((column) => (
          <Td key={column.key} numeric>
            <Cell value={row.byColumn[column.key]} />
          </Td>
        ))}
        <Td numeric>
          <span className="font-semibold text-ink">{num(row.committed)}</span>
        </Td>
        <Td numeric>{row.orders}</Td>
        <Td numeric>
          {row.stockCartons === null ? (
            <span className="text-ink-disabled">—</span>
          ) : (
            num(row.stockCartons)
          )}
        </Td>
        <Td numeric className="pr-lg">
          {row.shortBy === null ? (
            <span className="text-ink-disabled">—</span>
          ) : row.shortBy > 0 ? (
            <span className="font-semibold text-accent-red">{num(row.shortBy)}</span>
          ) : (
            <span className="text-ink-disabled">—</span>
          )}
        </Td>
      </tr>
      {expanded
        ? row.lines.map((line) => (
            <OrderRow key={line.purchaseOrderId} line={line} board={board} />
          ))
        : null}
    </>
  );
}

/**
 * One open order's share, in the same columns as the total above it.
 *
 * **The identifier is the link, and it never truncates.** It is the thing a
 * planner carries out of this row — into a search, a phone call, the order's
 * own page — so a squeezed `Order ID W-2609-0…` is the one abbreviation this
 * row cannot afford. It is `whitespace-nowrap`, and the caption wraps onto a
 * second line rather than shortening it; the buyer's name above it truncates
 * instead, with the full value in `title`, which is 00-master §4's
 * truncation-recovery rule. The buyer is no longer a link of its own: two
 * links a line apart pointing at the same purchase order read as two
 * destinations to anything that lists them.
 *
 * On hand and Short by stay empty rather than reading `—`: stock is held per
 * product, not per order, so a dash here would be answering a question that
 * was never asked of this row.
 */
export function OrderRow({ line, board }: { line: DemandLine; board: DemandBoard }) {
  return (
    <tr className="border-b border-hairline bg-surface-soft/40 last:border-0">
      <td className="sticky left-0 z-10 max-w-72 bg-canvas py-sm pl-lg pr-md">
        <div className="pl-[calc(var(--spacing-xs)+1.5rem)]">
          <p
            className="truncate text-[length:var(--text-body-sm)] text-ink"
            title={line.buyerName}
          >
            {line.buyerName}
          </p>
          {/* Wraps rather than squeezes. Every part carries its own leading
              separator — spaces included, since a flex item's text is
              concatenated with its neighbour's when the line is read out or
              copied, and `PO-2026-0039· 12 Sep` is two facts glued into one.
              A leading space is dropped at the start of a line box, so the
              gap on screen is the `gap-x-xxs` either way, and a part that
              drops to the next line does not strand a `·` above it. */}
          <p className="flex flex-wrap items-center gap-x-xxs text-[length:var(--text-caption)] text-ink-tertiary">
            <Link
              href={`/purchase-orders/${line.purchaseOrderId}`}
              className="whitespace-nowrap font-medium text-ink-secondary hover:text-brand-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {line.label}
            </Link>
            <span className="whitespace-nowrap">{" · "}{line.deliveryDate}</span>
            {/* How late, beside the date it is measured from rather than in
                the Overdue column: a numeric column that also carries words
                cannot be read across, copied, or totalled by eye. */}
            {line.daysLate > 0 ? (
              <span className="whitespace-nowrap font-medium text-accent-red">
                {" · "}
                {line.daysLate} day{line.daysLate === 1 ? "" : "s"} late
              </span>
            ) : null}
          </p>
          <p className="mt-xxs">
            <StageBadge stage={line.stage} state="done" compact />
          </p>
        </div>
      </td>
      {board.anyOverdue ? (
        <Td numeric>
          {line.columnKey === null ? (
            <span className="font-semibold text-accent-red">{num(line.cartons)}</span>
          ) : (
            <span className="text-ink-disabled">—</span>
          )}
        </Td>
      ) : null}
      {board.columns.map((column) => (
        <Td key={column.key} numeric>
          {line.columnKey === column.key ? (
            num(line.cartons)
          ) : (
            <span className="text-ink-disabled">—</span>
          )}
        </Td>
      ))}
      <Td numeric>{num(line.cartons)}</Td>
      <Td numeric />
      <Td numeric />
      <Td numeric className="pr-lg" />
    </tr>
  );
}

function Th({
  children,
  numeric = false,
  className = "",
}: {
  children?: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap py-sm pr-md text-[length:var(--text-caption)] font-medium text-ink-tertiary ${numeric ? "text-right" : ""} ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  numeric = false,
  className = "",
}: {
  children?: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`whitespace-nowrap py-sm pr-md text-[length:var(--text-body-sm)] text-ink ${numeric ? "text-right tabular-nums" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

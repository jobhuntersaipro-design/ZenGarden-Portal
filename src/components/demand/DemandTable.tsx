"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Scroller } from "@/components/demand/Scroller";
import { Reveal } from "@/components/portal/Reveal";
import { StageBadge } from "@/components/portal/StatusBadge";
import { usePresence } from "@/hooks/usePresence";
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
 * Stock count and Short by render as dashes until a count exists. They are
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
              <Th numeric>Stock count (carton)</Th>
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
  // The orders stay mounted while they fold away, so the rows below are
  // walked back up rather than dropped (2026-09-25: opening one product
  // moved everything under it 470px in a single frame).
  const { mounted, closing } = usePresence(expanded);
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
      {mounted
        ? row.lines.map((line) => (
            <OrderRow
              key={line.purchaseOrderId}
              line={line}
              board={board}
              reveal={{ closing }}
            />
          ))
        : null}
    </>
  );
}

/**
 * How long until the expected date, in words.
 *
 * A negative figure is not a mistake and is not rounded away: "late" on this
 * board is measured at the grain being read, so a monthly board can carry an
 * order whose date is a fortnight gone in September's column rather than in
 * Overdue. `2 days ago` is what that row honestly says; the red `N days late`
 * caption above belongs to the orders the Overdue column actually counts.
 */
function dueIn(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "due today";
  if (days < 0) return `due ${-days} day${days === -1 ? "" : "s"} ago`;
  return `due in ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * One open order's share, in the same columns as the total above it.
 *
 * **Both identifiers, one per line, and neither ever truncates.** The buyer's
 * `PO number …` leads and is the link, because that is what a planner quotes
 * when they chase the order; our `Order ID W-…` sits under it, where the
 * order has one. They are on separate lines rather than one, because a reader
 * copying `PO number ACME-PO-771 · Order ID W-2609-00014` out of a row has to
 * cut it in half before either half is usable, and because the pair is what
 * this row is read for — a squeezed `Order ID W-2609-0…` is the one
 * abbreviation it cannot afford. Both are `whitespace-nowrap`; the buyer's
 * name above them truncates instead, with the full value in `title`, which is
 * 00-master §4's truncation-recovery rule. The buyer is not a link of its
 * own: two links a line apart pointing at the same purchase order read as two
 * destinations to anything that lists them.
 *
 * On hand and Short by stay empty rather than reading `—`: stock is held per
 * product, not per order, so a dash here would be answering a question that
 * was never asked of this row.
 */
export function OrderRow({
  line,
  board,
  reveal,
}: {
  line: DemandLine;
  board: DemandBoard;
  /**
   * Given, the row grows into place and — with `closing` — folds away. A
   * table row cannot animate its own height, so each cell's content does,
   * with the cell's padding moved inside the growing box: padding outside it
   * would hold the row open at 24px.
   */
  reveal?: { closing: boolean };
}) {
  const first = (
        <div className="pl-[calc(var(--spacing-xs)+1.5rem)]">
          <p
            className="truncate text-[length:var(--text-body-sm)] text-ink"
            title={line.buyerName}
          >
            {line.buyerName}
          </p>
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            <Link
              href={`/purchase-orders/${line.purchaseOrderId}`}
              className="whitespace-nowrap font-medium text-ink-secondary hover:text-brand-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {line.label}
            </Link>
          </p>
          {/* Our own Order ID under the buyer's number, on its own line
              because the two are quoted separately and must never be read as
              one. Absent rather than dashed where the order has none: a
              scanned purchase order was never given an Order ID, so a dash on
              every sub-row of a scan-only board would be ten repetitions of a
              fact about nothing. */}
          {line.orderIdLabel ? (
            <p className="whitespace-nowrap text-[length:var(--text-caption)] text-ink-tertiary">
              {line.orderIdLabel}
            </p>
          ) : null}
          {/* The buyer's own date, and ours. Labelled, because two bare
              dates a line apart are indistinguishable — and on separate
              lines, because the pair is what the row is read for. */}
          <p className="whitespace-nowrap text-[length:var(--text-caption)] text-ink-tertiary">
            PO date {line.poDate}
          </p>
          <p className="flex flex-wrap items-center gap-x-xxs text-[length:var(--text-caption)] text-ink-tertiary">
            <span className="whitespace-nowrap">Expected {line.deliveryDate}</span>
            {/* How late or how soon, beside the date it is measured from
                rather than in the Overdue column: a numeric column that also
                carries words cannot be read across, copied, or totalled by
                eye. */}
            {line.daysLate > 0 ? (
              <span className="whitespace-nowrap font-medium text-accent-red">
                {" · "}
                {line.daysLate} day{line.daysLate === 1 ? "" : "s"} late
              </span>
            ) : (
              <span className="whitespace-nowrap">{" · "}{dueIn(line.dueInDays)}</span>
            )}
          </p>
          <p className="mt-xxs">
            <StageBadge stage={line.stage} state="done" compact />
          </p>
        </div>
  );
  return (
    <tr className="border-b border-hairline bg-surface-soft/40 last:border-0">
      {reveal ? (
        <td className="sticky left-0 z-10 max-w-72 bg-canvas py-0 pl-lg pr-md">
          <Reveal closing={reveal.closing} className="py-sm">
            {first}
          </Reveal>
        </td>
      ) : (
        <td className="sticky left-0 z-10 max-w-72 bg-canvas py-sm pl-lg pr-md">{first}</td>
      )}
      {board.anyOverdue ? (
        <Td reveal={reveal} numeric>
          {line.columnKey === null ? (
            <span className="font-semibold text-accent-red">{num(line.cartons)}</span>
          ) : (
            <span className="text-ink-disabled">—</span>
          )}
        </Td>
      ) : null}
      {board.columns.map((column) => (
        <Td reveal={reveal} key={column.key} numeric>
          {line.columnKey === column.key ? (
            num(line.cartons)
          ) : (
            <span className="text-ink-disabled">—</span>
          )}
        </Td>
      ))}
      <Td reveal={reveal} numeric>{num(line.cartons)}</Td>
      <Td reveal={reveal} numeric />
      <Td reveal={reveal} numeric />
      <Td reveal={reveal} numeric className="pr-lg" />
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

type TdProps = {
  children?: React.ReactNode;
  numeric?: boolean;
  className?: string;
};

/**
 * `reveal` is an order row's cell growing in or folding away: the padding
 * moves inside the growing box, because padding on the cell itself would hold
 * the row open while its content shrank.
 */
function Td({
  children,
  numeric = false,
  className = "",
  reveal,
}: TdProps & { reveal?: { closing: boolean } }) {
  if (reveal) {
    return (
      <td
        className={`whitespace-nowrap py-0 pr-md text-[length:var(--text-body-sm)] text-ink ${numeric ? "text-right tabular-nums" : ""} ${className}`}
      >
        <Reveal closing={reveal.closing} className="py-sm">
          {children}
        </Reveal>
      </td>
    );
  }
  return (
    <td
      className={`whitespace-nowrap py-sm pr-md text-[length:var(--text-body-sm)] text-ink ${numeric ? "text-right tabular-nums" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

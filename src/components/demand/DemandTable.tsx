import Link from "next/link";
import { Scroller } from "@/components/demand/Scroller";
import type { DemandBoard } from "@/lib/queries/demand";

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
 * The runway list: one row per product, weeks across, most committed first.
 *
 * Deliberately not `DataTable`. That component pages, sorts by URL and drops
 * to card mode on a phone, all of which this board would have to fight: the
 * week columns are computed rather than declared, the row is only meaningful
 * read across, and there is nothing here to page through — the window is the
 * paging.
 *
 * On hand and Short by render as dashes until a stock count exists. They are
 * kept in the table rather than hidden so the shape of the answer is visible
 * before the data for it is: the point of the board is what runs out, and a
 * column quietly missing would not say that it is missing.
 */
export function DemandTable({ board }: { board: DemandBoard }) {
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
              {board.weeks.map((week) => (
                <Th key={week.key} numeric>
                  {week.label}
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
            {board.rows.map((row) => (
              <tr key={row.productId} className="border-b border-hairline last:border-0">
                <td className="sticky left-0 z-10 max-w-64 bg-canvas py-sm pl-lg pr-md">
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
                {board.weeks.map((week) => (
                  <Td key={week.key} numeric>
                    <Cell value={row.byWeek[week.key]} />
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
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink">
              <Th className="sticky left-0 z-10 bg-canvas pl-lg">Total cartons</Th>
              {board.anyOverdue ? (
                <Td numeric>
                  <span className="font-semibold text-ink">{num(board.totals.overdue)}</span>
                </Td>
              ) : null}
              {board.weeks.map((week) => (
                <Td key={week.key} numeric>
                  <span className="font-semibold text-ink">
                    <Cell value={board.totals.byWeek[week.key]} />
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
        Cartons wanted, by the week their order is expected. A dash is nothing
        promised, not a zero.
      </p>
    </section>
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

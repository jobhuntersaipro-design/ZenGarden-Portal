import Link from "next/link";
import { NO_MARKET, type BuyerMarketFilter } from "@/lib/buyer-markets";

/**
 * How many buyers nobody has given a market, said once above the roster.
 *
 * The per-row **Not set** chip already marks each one, but a chip is only
 * read by somebody who is already looking at that row — on page three of a
 * roster sorted by revenue, a buyer whose shop is empty is invisible. This is
 * the page-level answer to "who cannot buy anything", and it is the worklist
 * the market rule creates: every unassigned buyer can sign in and see no
 * products at all (`shop-market.ts`), which is a customer-facing consequence
 * rather than a missing detail.
 *
 * It renders nothing at zero, like `WorkQueue`: an alert that is always on
 * screen saying there is no problem is furniture, and the next real one is
 * read as furniture too.
 *
 * **It links only when the link answers its own sentence.** `?market=*none`
 * lists exactly the buyers it counts — but while that filter is already
 * applied the table below *is* that list, so the link would lead where the
 * reader already stands. It prints plain text then, the same call the stage
 * board's pinned legend makes (`context/lessons.md` §2).
 */
export function NoMarketAlert({
  count,
  total,
  market,
  basePath,
}: {
  /** Buyers carrying no market, counted over the whole roster. */
  count: number;
  /** Buyers on the roster, so the alert can say how big a share this is. */
  total: number;
  /** The filter the table is already under, resolved — never the raw parameter. */
  market: BuyerMarketFilter;
  /** `/buyers` or `/admin/buyers` — the roster this alert sits on. */
  basePath: string;
}) {
  if (count === 0) return null;
  const all = count === total;
  const showing = market === NO_MARKET;

  return (
    <div
      role="status"
      className="mb-lg rounded-sm border border-brand-amber bg-surface-warning p-md"
    >
      <p className="text-[length:var(--text-body-sm)] text-ink">
        <strong className="font-semibold">
          {all
            ? count === 1
              ? "This buyer has no market."
              : `No buyer has a market yet — all ${count} of them.`
            : `${count} ${count === 1 ? "buyer has" : "buyers have"} no market.`}
        </strong>{" "}
        Their shop is empty until one is set: they can sign in and see no
        products and place no orders. Set it on the buyer&rsquo;s own page,
        under Details.
      </p>
      {showing ? null : (
        <Link
          href={`${basePath}?market=${encodeURIComponent(NO_MARKET)}`}
          className="mt-xs inline-block text-[length:var(--text-body-sm)] font-medium text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Show {count === 1 ? "the buyer" : `those ${count} buyers`} →
        </Link>
      )}
    </div>
  );
}

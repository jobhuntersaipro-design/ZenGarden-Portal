import type { Metadata } from "next";
import Link from "next/link";
import { BuyersTable } from "@/components/admin/BuyersTable";
import { NoMarketAlert } from "@/components/buyers/NoMarketAlert";
import { LinkSpinner } from "@/components/portal/LinkSpinner";
import { Rise } from "@/components/portal/Rise";
import { Button } from "@/components/ui/button";
import { buyerMarketOptions, resolveBuyerMarket } from "@/lib/buyer-markets";
import {
  ACCESS_FILTERS,
  accessCounts,
  type AccessFilter,
} from "@/lib/queries/admin-buyer-labels";
import {
  ADMIN_BUYER_SORT_KEYS,
  listAdminBuyers,
  selectAdminBuyers,
} from "@/lib/queries/admin-buyers";
import { firstParam, parseSort, type SearchParams } from "@/lib/queries/pagination";

export const metadata: Metadata = { title: "Buyer management · Zen Garden Portal" };
export const dynamic = "force-dynamic";

export default async function AdminBuyersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const buyers = await listAdminBuyers();

  const q = firstParam(params, "q")?.trim() || undefined;
  const accessParam = firstParam(params, "access") as AccessFilter;
  const access = ACCESS_FILTERS.includes(accessParam) ? accessParam : "all";
  const sort = parseSort(params, ADMIN_BUYER_SORT_KEYS, { key: "name", dir: "asc" });
  // Resolved against the whole roster, never the filtered one: a market
  // nobody is in any more is dropped rather than drawing an empty table with
  // the select still showing it, and the options offered always match
  // somebody. The page passes the *resolved* value down, so the control can
  // never show a filter the rows are not under.
  const market = resolveBuyerMarket(firstParam(params, "market"), buyers);
  const rows = selectAdminBuyers(buyers, { q, access, market, sort });
  const counts = accessCounts(buyers);
  const marketOptions = buyerMarketOptions(buyers);

  return (
    <>
      <Rise index={0} className="mb-lg flex flex-wrap items-end justify-between gap-md">
        <div>
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Directory
          </p>
          <h1 className="font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink">
            Buyer management
          </h1>
          {buyers.length > 0 ? (
            <p className="mt-xxs text-[length:var(--text-body-sm)] text-ink-secondary">
              {buyers.length} {buyers.length === 1 ? "buyer" : "buyers"} · {counts.active} with
              shop access
              {counts.invited > 0 ? ` · ${counts.invited} awaiting first sign-in` : ""}
            </p>
          ) : null}
        </div>
        {/* The one action this page is for, so it is the ink pill and it is
            alone. A real anchor, so cmd-click opens a tab. */}
        <Button asChild>
          <Link href="/admin/buyers/new">
            <LinkSpinner />
            New buyer
          </Link>
        </Button>
      </Rise>

      {buyers.length === 0 ? (
        <Rise index={1}>
          <p className="rounded-lg border border-hairline bg-canvas px-md py-xl text-center text-[length:var(--text-body-md)] text-ink-tertiary">
            No buyers yet.{" "}
            <Link
              href="/admin/buyers/new"
              className="text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Create the first one.
            </Link>
          </p>
        </Rise>
      ) : (
        <>
          {/* Above the table rather than inside it: the per-row chip only
              reaches a reader already looking at that row, and the roster
              pages. Counted over every buyer, not the page. */}
          <Rise index={1}>
            <NoMarketAlert
              count={marketOptions.noMarket}
              total={buyers.length}
              market={market}
              basePath="/admin/buyers"
            />
          </Rise>
          <Rise index={2}>
            <BuyersTable
              buyers={rows}
              sort={sort}
              access={access}
              counts={counts}
              market={market}
              markets={marketOptions.markets}
              noMarket={marketOptions.noMarket}
            />
          </Rise>
        </>
      )}
    </>
  );
}

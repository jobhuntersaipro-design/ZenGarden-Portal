import type { Metadata } from "next";
import Link from "next/link";
import { CustomersTable } from "@/components/admin/CustomersTable";
import { LinkSpinner } from "@/components/portal/LinkSpinner";
import { Button } from "@/components/ui/button";
import {
  CUSTOMER_SORT_KEYS,
  listCustomers,
  selectCustomers,
} from "@/lib/queries/admin-customers";
import { firstParam, parseSort, type SearchParams } from "@/lib/queries/pagination";

export const metadata: Metadata = { title: "Customers · Loving Hands Portal" };
export const dynamic = "force-dynamic";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const customers = await listCustomers();

  const q = firstParam(params, "q")?.trim() || undefined;
  const sort = parseSort(params, CUSTOMER_SORT_KEYS, { key: "name", dir: "asc" });
  const rows = selectCustomers(customers, { q, sort });

  return (
    <>
      <div className="mb-lg flex flex-wrap items-end justify-between gap-md">
        <div>
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Directory
          </p>
          <h1 className="font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink">
            Customers
          </h1>
        </div>
        {/* The one action this page is for, so it is the ink pill and it is
            alone. A real anchor, so cmd-click opens a tab. */}
        <Button asChild>
          <Link href="/admin/customers/new">
            <LinkSpinner />
            New customer
          </Link>
        </Button>
      </div>

      {customers.length === 0 ? (
        <p className="text-[length:var(--text-body-md)] text-ink-tertiary">
          No customers yet.{" "}
          <Link
            href="/admin/customers/new"
            className="text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Create the first one.
          </Link>
        </p>
      ) : (
        <CustomersTable customers={rows} sort={sort} />
      )}
    </>
  );
}

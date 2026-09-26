import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/portal/BackLink";
import { BuyerForm } from "@/components/buyers/BuyerForm";
import { listLabels } from "@/lib/queries/products";
import { can } from "@/lib/permissions/require";
import { withLoadingFloor } from "@/lib/loading-floor";

export const metadata: Metadata = {
  title: "New buyer · Zen Garden Portal",
};
export const dynamic = "force-dynamic";

async function NewBuyerPage() {
  // The directory only offers this link to whoever may use it, but the link
  // is a URL and anyone can type it. `createBuyer` refuses either way; this
  // is so a reader sees the directory rather than a form that can never save.
  //
  // The key, not the role: `createBuyer` itself guards on `buyer.manage`, so
  // a role the grid has granted it would otherwise be redirected away from a
  // form the action would have accepted.
  if (!(await can("buyer.manage"))) redirect("/buyers");

  // The MARKET vocabulary, so the picker offers the same values
  // `Product.market` is chosen from — the two have to match exactly for a
  // buyer to see anything.
  const markets = await listLabels("market");

  return (
    <>
      <BackLink fallbackHref="/buyers" />
      <nav aria-label="Breadcrumb" className="mb-xs">
        <Link
          href="/buyers"
          className="inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
        >
          Buyers
        </Link>
        <span className="text-[length:var(--text-body-sm)] text-ink-tertiary">
          {" / "}
          New buyer
        </span>
      </nav>

      <BuyerForm markets={markets} afterCreate="/buyers" />
    </>
  );
}

export default withLoadingFloor(NewBuyerPage);

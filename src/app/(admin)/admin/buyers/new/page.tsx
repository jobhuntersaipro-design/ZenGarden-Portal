import type { Metadata } from "next";
import Link from "next/link";
import { BuyerForm } from "@/components/buyers/BuyerForm";
import { listLabels } from "@/lib/queries/products";

export const metadata: Metadata = { title: "New buyer · Zen Garden Portal" };
export const dynamic = "force-dynamic";

export default async function NewAdminBuyerPage() {
  // The MARKET vocabulary, so the picker offers the same values
  // `Product.market` is chosen from — the two have to match exactly for a
  // buyer to see anything.
  const markets = await listLabels("market");

  return (
    <>
      <Link
        href="/admin/buyers"
        className="mb-md inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
      >
        ‹ Buyer management
      </Link>
      <BuyerForm markets={markets} afterCreate="/admin/buyers" />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { BuyerForm } from "@/components/buyers/BuyerForm";

export const metadata: Metadata = { title: "New buyer · Loving Hands Portal" };
export const dynamic = "force-dynamic";

export default function NewAdminBuyerPage() {
  return (
    <>
      <Link
        href="/admin/buyers"
        className="mb-md inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
      >
        ‹ Buyer management
      </Link>
      <BuyerForm afterCreate="/admin/buyers" />
    </>
  );
}

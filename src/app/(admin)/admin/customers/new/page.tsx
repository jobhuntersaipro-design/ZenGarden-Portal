import type { Metadata } from "next";
import Link from "next/link";
import { CustomerForm } from "@/components/buyers/CustomerForm";

export const metadata: Metadata = { title: "New customer · Loving Hands Portal" };
export const dynamic = "force-dynamic";

export default function NewAdminCustomerPage() {
  return (
    <>
      <Link
        href="/admin/customers"
        className="mb-md inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
      >
        ‹ Customers
      </Link>
      <CustomerForm afterCreate="/admin/customers" />
    </>
  );
}

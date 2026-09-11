import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { BackLink } from "@/components/portal/BackLink";
import { CustomerForm } from "@/components/buyers/CustomerForm";
import { getSessionUser } from "@/lib/auth-guards";

export const metadata: Metadata = {
  title: "New customer · Loving Hands Portal",
};
export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  const user = await getSessionUser();
  // The directory only offers this link to a super admin, but the link is a
  // URL and anyone can type it. `createCustomer` refuses either way; this is
  // so a member sees the directory rather than a form that can never save.
  if (user?.role !== Role.SUPER_ADMIN) redirect("/buyers");

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
          New customer
        </span>
      </nav>

      <CustomerForm />
    </>
  );
}

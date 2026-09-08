import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { BackLink } from "@/components/portal/BackLink";
import { ProductForm } from "@/components/products/ProductForm";
import { getSessionUser } from "@/lib/auth-guards";
import { listAllLabels } from "@/lib/queries/products";

export const metadata: Metadata = {
  title: "New product · Loving Hands Portal",
};
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const user = await getSessionUser();
  // The catalog only offers this link to a super admin, but the link is a URL
  // and anyone can type it. `createProduct` refuses either way; this is so a
  // member sees the catalog rather than a form that can never save.
  if (user?.role !== Role.SUPER_ADMIN) redirect("/products");

  const labels = await listAllLabels();

  return (
    <>
      <BackLink fallbackHref="/products" />
      <nav aria-label="Breadcrumb" className="mb-xs">
        <Link
          href="/products"
          className="inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
        >
          Products
        </Link>
        <span className="text-[length:var(--text-body-sm)] text-ink-tertiary">
          {" / "}
          New product
        </span>
      </nav>

      <ProductForm labels={labels} />
    </>
  );
}

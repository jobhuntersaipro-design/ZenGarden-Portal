import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { BackLink } from "@/components/portal/BackLink";
import { ProductForm } from "@/components/products/ProductForm";
import { getSessionUser } from "@/lib/auth-guards";
import { listFamilies } from "@/lib/queries/product-families";
import { listAllLabels } from "@/lib/queries/products";

export const metadata: Metadata = {
  title: "New product · Zen Garden Portal",
};
export const dynamic = "force-dynamic";
// A Server Action runs in the function of the page that called it, and this
// one's `copyImagesToVariants` can run to tens of seconds on a large submit
// (Phase 39 browser pass, task-7-report.md §4) even with bounded concurrency.
// 120s matches the ceiling `vercel.json` already grants
// `src/app/api/upload/complete/route.ts` for the same shape of work — R2
// copies and sharp-processed uploads — rather than inventing a new one. A
// route handler takes this through `vercel.json`; a page segment takes it as
// its own export instead.
export const maxDuration = 120;

export default async function NewProductPage() {
  const user = await getSessionUser();
  // The catalog only offers this link to a super admin, but the link is a URL
  // and anyone can type it. `createProductVariants` refuses either way; this
  // is so a member sees the catalog rather than a form that can never save.
  if (user?.role !== Role.SUPER_ADMIN) redirect("/products");

  const [labels, families] = await Promise.all([listAllLabels(), listFamilies()]);

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

      <ProductForm labels={labels} families={families} />
    </>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/portal/BackLink";
import { ProductForm } from "@/components/products/ProductForm";
import { listFamilies } from "@/lib/queries/product-families";
import { listAllLabels } from "@/lib/queries/products";
import { can } from "@/lib/permissions/require";
import { withLoadingFloor } from "@/lib/loading-floor";
import { Breadcrumb } from "@/components/arc/breadcrumb/breadcrumb";

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

async function NewProductPage() {
  // The catalog only offers this link to whoever may use it, but the link is
  // a URL and anyone can type it. `createProductVariants` refuses either way;
  // this is so a reader sees the catalog rather than a form that can never
  // save.
  //
  // The key, not the role: the action itself guards on `product.manage`, so a
  // role the grid has granted it would otherwise be redirected away from a
  // form the action would have accepted.
  if (!(await can("product.manage"))) redirect("/products");

  const [labels, families] = await Promise.all([listAllLabels(), listFamilies()]);

  return (
    <>
      <BackLink fallbackHref="/products" />
      {/* Arc's breadcrumb (docs/specs/61-arc-preview-switch.md). */}
      <div className="mb-xs">
        <Breadcrumb
          items={[
            { label: "Products", href: "/products" },
            { label: "New product" },
          ]}
        />
      </div>

      <ProductForm labels={labels} families={families} />
    </>
  );
}

export default withLoadingFloor(NewProductPage);

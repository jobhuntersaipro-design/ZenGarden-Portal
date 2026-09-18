import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can } from "@/lib/permissions/require";
import { BackLink } from "@/components/portal/BackLink";
import { PageHeader } from "@/components/portal/PageHeader";
import { UploadWorkspace } from "@/components/upload/UploadWorkspace";

export const metadata: Metadata = {
  title: "Upload purchase orders · Zen Garden Portal",
};

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Phase 48: the view-only role has no business here.
  if (!(await can("po.upload"))) notFound();
  const params = await searchParams;
  const buyer = params.buyer;
  const hintBuyerId = Array.isArray(buyer) ? buyer[0] : buyer;

  return (
    <>
      {/* Upload has no breadcrumb of its own, so this is the only way out
          that is not the browser's own chrome (brief G2). */}
      <BackLink fallbackHref="/purchase-orders" />
      <PageHeader eyebrow="Intake" title="Upload purchase orders" />
      <UploadWorkspace hintBuyerId={hintBuyerId} />
    </>
  );
}

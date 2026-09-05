import type { Metadata } from "next";
import { PageHeader } from "@/components/portal/PageHeader";
import { UploadWorkspace } from "@/components/upload/UploadWorkspace";

export const metadata: Metadata = {
  title: "Upload purchase orders · Loving Hands Portal",
};

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const buyer = params.buyer;
  const hintBuyerId = Array.isArray(buyer) ? buyer[0] : buyer;

  return (
    <>
      <PageHeader eyebrow="Intake" title="Upload purchase orders" />
      <UploadWorkspace hintBuyerId={hintBuyerId} />
    </>
  );
}

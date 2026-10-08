import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/permissions/require";
import { BackLink } from "@/components/portal/BackLink";
import { PageHeader } from "@/components/portal/PageHeader";
import { UploadWorkspace } from "@/components/upload/UploadWorkspace";
import { withLoadingFloor } from "@/lib/loading-floor";

export const metadata: Metadata = {
  title: "Upload booking confirmations · Zen Garden Portal",
};

async function UploadBookingsPage() {
  await requirePagePermission("bc.upload");
  return (
    <>
      <BackLink fallbackHref="/booking-confirmations" />
      <PageHeader eyebrow="Intake" title="Upload booking confirmations" />
      <UploadWorkspace kind="bc" />
    </>
  );
}

export default withLoadingFloor(UploadBookingsPage);

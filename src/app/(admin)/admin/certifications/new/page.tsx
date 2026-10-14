import type { Metadata } from "next";
import { CertificateForm } from "@/components/certificates/CertificateForm";
import { BackLink } from "@/components/portal/BackLink";
import { withLoadingFloor } from "@/lib/loading-floor";
import { listCertifiableProducts } from "@/lib/queries/certificates";

export const metadata: Metadata = { title: "Upload certificate · Zen Garden Portal" };
export const dynamic = "force-dynamic";

async function NewCertificatePage() {
  const products = await listCertifiableProducts();
  return (
    <>
      <BackLink fallbackHref="/admin/certifications" />
      <h1 className="mb-lg font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink">
        Upload certificate
      </h1>
      <CertificateForm products={products} />
    </>
  );
}

export default withLoadingFloor(NewCertificatePage);

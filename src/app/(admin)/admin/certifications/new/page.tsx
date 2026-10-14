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
      <div className="mb-lg">
        <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          Halal · NOT · COA · Other
        </p>
        <h1 className="font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink">
          Upload certificate
        </h1>
        <p className="mt-xxs text-[length:var(--text-body-sm)] text-ink-secondary">
          Drop the file in and AI reads its type, number and expiry. Check them, tick the
          products it covers, and save.
        </p>
      </div>
      <CertificateForm products={products} />
    </>
  );
}

export default withLoadingFloor(NewCertificatePage);

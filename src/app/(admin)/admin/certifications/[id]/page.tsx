import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CertificateForm } from "@/components/certificates/CertificateForm";
import { BackLink } from "@/components/portal/BackLink";
import { CERT_LABEL } from "@/lib/certification";
import { withLoadingFloor } from "@/lib/loading-floor";
import { listCertifiableProducts, loadCertificate } from "@/lib/queries/certificates";

export const metadata: Metadata = { title: "Certificate · Zen Garden Portal" };
export const dynamic = "force-dynamic";

async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [certificate, products] = await Promise.all([loadCertificate(id), listCertifiableProducts()]);
  if (!certificate) notFound();
  return (
    <>
      <BackLink fallbackHref="/admin/certifications?view=certificates" />
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        {CERT_LABEL[certificate.type]}
      </p>
      <h1
        title={certificate.originalName}
        className="mb-lg truncate font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink"
      >
        {certificate.originalName}
      </h1>
      <CertificateForm products={products} certificate={certificate} />
    </>
  );
}

export default withLoadingFloor(CertificatePage);

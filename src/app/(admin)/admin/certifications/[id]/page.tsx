import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CertificateForm } from "@/components/certificates/CertificateForm";
import { BackLink } from "@/components/portal/BackLink";
import { DOC_LABEL } from "@/lib/certification";
import { withLoadingFloor } from "@/lib/loading-floor";
import { formatDate, formatDateTime } from "@/lib/dates";
import {
  listCertifiableProducts,
  loadCertificate,
  loadExpiryHistory,
} from "@/lib/queries/certificates";

export const metadata: Metadata = { title: "Certificate · Zen Garden Portal" };
export const dynamic = "force-dynamic";

async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [certificate, products, history] = await Promise.all([
    loadCertificate(id),
    listCertifiableProducts(),
    loadExpiryHistory(id),
  ]);
  if (!certificate) notFound();
  return (
    <>
      <BackLink fallbackHref="/admin/certifications?view=certificates" />
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        {DOC_LABEL[certificate.type]}
      </p>
      <h1
        title={certificate.originalName}
        className="mb-lg truncate font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink"
      >
        {certificate.originalName}
      </h1>
      <CertificateForm products={products} certificate={certificate} />
      {history.length > 0 ? (
        <section className="mt-lg min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
          <h2 className="font-display text-[length:var(--text-heading-sm)] font-[650] text-ink">
            Expiry history
          </h2>
          <ul className="mt-sm space-y-xs text-[length:var(--text-body-sm)] text-ink-secondary">
            {history.map((entry) => (
              <li key={entry.id}>
                <span className="text-ink">
                  {entry.by ?? "Someone"} changed the expiry from {entry.from ? formatDate(entry.from) : "—"} to{" "}
                  {formatDate(entry.to)}
                </span>
                {" · "}
                {formatDateTime(entry.at)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export default withLoadingFloor(CertificatePage);

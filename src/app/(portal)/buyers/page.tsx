import { PageHeader } from "@/components/portal/PageHeader";
import { UploadPoButton } from "@/components/portal/UploadPoButton";

export default function Page() {
  return (
    <>
      <PageHeader
        eyebrow="Directory"
        title="Buyers"
        action={<UploadPoButton />}
      />
      <section className="rounded-lg border border-hairline bg-canvas p-lg">
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          This screen arrives in a later phase.
        </p>
      </section>
    </>
  );
}

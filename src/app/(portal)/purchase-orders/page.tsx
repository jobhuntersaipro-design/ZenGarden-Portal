import { PageHeader } from "@/components/portal/PageHeader";

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Records" title="Purchase orders" />
      <section className="rounded-lg border border-hairline bg-canvas p-lg">
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          This screen arrives in a later phase.
        </p>
      </section>
    </>
  );
}

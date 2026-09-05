import { PageHeader } from "@/components/portal/PageHeader";
import { UploadPoButton } from "@/components/portal/UploadPoButton";
import { prisma } from "@/lib/prisma";

/** Counts are read per request; the dashboard is never statically cached. */
export const dynamic = "force-dynamic";

async function getPurchaseOrderCount(): Promise<number | null> {
  try {
    return await prisma.purchaseOrder.count();
  } catch {
    // No database yet. The shell still renders so the nav is usable.
    return null;
  }
}

export default async function DashboardPage() {
  const count = await getPurchaseOrderCount();

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        action={<UploadPoButton />}
      />
      <section className="rounded-lg border border-hairline bg-canvas p-lg">
        <p className="text-[length:var(--text-body-md)] text-ink">
          Dashboard arrives in Phase 06.
        </p>
        <p className="mt-xs text-[length:var(--text-body-sm)] text-ink-secondary">
          {count === null ? (
            <>
              Database not connected yet — set <code className="font-mono">DATABASE_URL</code>{" "}
              and <code className="font-mono">DIRECT_URL</code>, then run{" "}
              <code className="font-mono">npm run db:migrate</code> and{" "}
              <code className="font-mono">npm run db:seed</code>.
            </>
          ) : (
            <>
              <span className="tabular-nums font-medium text-ink">{count}</span>{" "}
              purchase orders in the database.
            </>
          )}
        </p>
      </section>
    </>
  );
}

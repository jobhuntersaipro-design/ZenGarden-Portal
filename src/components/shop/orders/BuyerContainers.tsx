import { ContainerGallery } from "@/components/shipments/ContainerGallery";
import { formatDate } from "@/lib/dates";
import type { BuyerContainer } from "@/lib/queries/buyer-containers";
import { shopHref } from "@/lib/shop-routes";

/**
 * The loaded container on the buyer's order (Phase 68): numbers, description,
 * photos and videos, with dates only — never a staff name.
 */
export function BuyerContainers({ orderId, containers }: { orderId: string; containers: BuyerContainer[] }) {
  if (!containers.length) return null;
  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="font-display text-[length:var(--text-heading-sm)] font-semibold text-ink">
        {containers.length === 1 ? "Your container" : "Your containers"}
      </h2>
      <div className="mt-md flex flex-col gap-lg">
        {containers.map((c) => (
          <div key={c.id} className="flex min-w-0 flex-col gap-sm">
            <dl className="grid grid-cols-2 gap-sm sm:grid-cols-3">
              {(
                [
                  ["Container no.", c.containerNo],
                  ["Seal no.", c.sealNo],
                  ["Size", c.size],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">{label}</dt>
                  <dd className="truncate text-[length:var(--text-body-sm)] text-ink">{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
            {c.description ? (
              <p className="whitespace-pre-line text-[length:var(--text-body-sm)] text-ink">{c.description}</p>
            ) : null}
            <p className="text-[length:var(--text-caption)] text-ink-tertiary">Updated {formatDate(c.updatedAt)}</p>
            <ContainerGallery
              base={shopHref.containerMediaBase(orderId)}
              items={c.media.map((m) => ({
                id: m.id,
                kind: m.kind,
                originalName: m.originalName,
                date: formatDate(m.uploadedAt),
              }))}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

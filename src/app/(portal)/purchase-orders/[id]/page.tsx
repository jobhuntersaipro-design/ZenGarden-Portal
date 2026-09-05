import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { DocumentPreview } from "@/components/review/DocumentPreviewLoader";
import { PageHeader } from "@/components/portal/PageHeader";
import { StageBadge } from "@/components/portal/StatusBadge";
import { ActivityList } from "@/components/purchase-orders/ActivityList";
import { DownloadOriginal } from "@/components/purchase-orders/DownloadOriginal";
import { EditPurchaseOrderSheet } from "@/components/purchase-orders/EditPurchaseOrderSheet";
import { LifecycleActions } from "@/components/purchase-orders/LifecycleActions";
import { StageStepper } from "@/components/purchase-orders/StageStepper";
import { getSessionUser } from "@/lib/auth-guards";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import { isFinalStage, nextStage, prevStage, stageIndex, stageLabel } from "@/lib/po-stages";
import { PO_STAGES } from "@/lib/po-stages";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: { poNumber: true },
  });
  return { title: `${po?.poNumber ?? "Purchase order"} · Loving Hands Portal` };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function PurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      buyer: true,
      document: { select: { id: true, originalName: true } },
      confirmedBy: { select: { name: true } },
      lineItems: {
        orderBy: { position: "asc" },
        include: { product: { select: { name: true, sku: true } } },
      },
      stageEvents: {
        orderBy: { changedAt: "desc" },
        include: { changedBy: { select: { name: true } } },
      },
      supersededBy: { select: { id: true, revision: true } },
      revisionOf: { select: { id: true, poNumber: true, confirmedAt: true } },
    },
  });
  if (!po) notFound();

  // An old revision is not a page of its own: the current one is the record.
  if (po.supersededBy) redirect(`/purchase-orders/${po.supersededBy.id}`);

  const current = po.stage;
  const daysFromOrder = Math.max(
    0,
    Math.round((po.stageChangedAt.getTime() - po.confirmedAt.getTime()) / DAY_MS),
  );

  const latestStageEvent = po.stageEvents.find((event) => event.kind === "STAGE");
  /**
   * The event is the source of truth for when this stage was entered, not
   * `stageChangedAt`. They are written together by `advanceStage`, but the
   * timeline and the stepper both read the event, and a caption that disagrees
   * with the two things beside it is worse than either being slightly stale.
   */
  const enteredStageAt = latestStageEvent?.changedAt ?? po.stageChangedAt;
  // "1 day in this stage" is meant to be read against the moment the page was
  // requested, and this page is `force-dynamic`, so each render is one request.
  // The purity rule guards against unstable re-renders on the client, which is
  // not a thing that happens here.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const daysInStage = Math.max(
    0,
    Math.round((now - enteredStageAt.getTime()) / DAY_MS),
  );

  return (
    <>
      {/* A detail page reached from four different places needs a way back. */}
      <nav aria-label="Breadcrumb" className="mb-xs">
        <Link
          href="/purchase-orders"
          className="text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Purchase orders
        </Link>
        <span className="text-[length:var(--text-body-sm)] text-ink-tertiary">
          {" / "}
          {po.poNumber}
        </span>
      </nav>

      <PageHeader
        eyebrow={po.poNumber}
        title={po.buyer.name}
        action={
          <div className="flex items-center gap-sm">
            <StageBadge stage={current} />
            {po.revision > 1 ? (
              <span className="rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] text-ink-secondary">
                Rev {po.revision}
              </span>
            ) : null}
            <DownloadOriginal documentId={po.document.id} />
            <EditPurchaseOrderSheet
              poId={po.id}
              initial={{
                poNumber: po.poNumber,
                poDate: po.poDate.toISOString().slice(0, 10),
                deliveryDate: po.deliveryDate
                  ? po.deliveryDate.toISOString().slice(0, 10)
                  : null,
                buyerReference: po.buyerReference,
                paymentTerms: po.paymentTerms,
                notes: po.notes,
              }}
            />
          </div>
        }
      />

      {po.revisionOf ? (
        <p className="mb-md text-[length:var(--text-caption)] text-ink-tertiary">
          Replaces{" "}
          <Link
            href={`/purchase-orders/${po.revisionOf.id}`}
            className="text-brand-link underline-offset-2 hover:underline"
          >
            {po.revisionOf.poNumber}
          </Link>
          , confirmed {formatDate(po.revisionOf.confirmedAt)}
        </p>
      ) : null}

      <section className="rounded-lg border border-hairline bg-canvas p-lg">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
              Lifecycle
            </p>
            <h2 className="font-display text-[length:var(--text-heading-sm)] font-[650] tracking-[-0.54px] text-ink">
              {isFinalStage(current)
                ? `Delivered · ${daysFromOrder} days from order`
                : `${stageLabel(current)} · stage ${stageIndex(current) + 1} of ${PO_STAGES.length}`}
            </h2>
            <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
              {latestStageEvent?.changedBy?.name
                ? `Moved here by ${latestStageEvent.changedBy.name}`
                : "Order placed by System"}{" "}
              on {formatDate(enteredStageAt)} · {daysInStage}{" "}
              {daysInStage === 1 ? "day" : "days"} in this stage
              {latestStageEvent?.note ? ` · “${latestStageEvent.note}”` : ""}
            </p>
          </div>

          <LifecycleActions
            poId={po.id}
            next={nextStage(current)}
            previous={prevStage(current)}
            canMoveBack={user?.role === Role.SUPER_ADMIN}
          />
        </div>

        <StageStepper
          current={current}
          events={po.stageEvents
            .filter((event) => event.kind === "STAGE")
            .map((event) => ({
              toStage: event.toStage,
              changedAt: event.changedAt.toISOString(),
              changedByName: event.changedBy?.name ?? null,
            }))}
        />
      </section>

      <div className="mt-lg grid gap-lg lg:grid-cols-[45fr_55fr]">
        <section>
          <p className="mb-xs font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Original document
          </p>
          <DocumentPreview
            documentId={po.document.id}
            originalName={po.document.originalName}
          />
        </section>

        <div className="flex flex-col gap-lg">
          <section className="rounded-lg border border-hairline bg-canvas p-lg">
            <h2 className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
              Summary
            </h2>
            <dl className="grid gap-sm sm:grid-cols-2">
              {[
                ["PO number", po.poNumber],
                ["Buyer", po.buyer.name],
                ["PO date", formatDate(po.poDate)],
                ["Delivery date", po.deliveryDate ? formatDate(po.deliveryDate) : "—"],
                ["Buyer reference", po.buyerReference ?? "—"],
                ["Payment terms", po.paymentTerms ?? "—"],
                ["Confirmed by", po.confirmedBy?.name ?? "—"],
                ["Confirmed at", formatDateTime(po.confirmedAt)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
                    {label}
                  </dt>
                  <dd
                    title={value}
                    className="truncate text-[length:var(--text-body-md)] text-ink"
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-lg border border-hairline bg-canvas p-lg">
            <h2 className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
              Line items
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-hairline text-left">
                    {["Description", "Qty", "Unit price", "Amount"].map((heading, index) => (
                      <th
                        key={heading}
                        scope="col"
                        className={`py-xs font-mono text-[length:var(--text-eyebrow)] font-normal text-ink-tertiary ${index > 0 ? "text-right" : ""}`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Not sortable: these are in the order they appear on the
                      customer's document, which is what lets someone check
                      them against the page beside it (design reference §4). */}
                  {po.lineItems.map((line) => (
                    <tr key={line.id} className="border-b border-hairline last:border-0">
                      <td className="py-xs pr-sm text-[length:var(--text-body-sm)] text-ink">
                        <span className="block truncate" title={line.description}>
                          {line.description}
                        </span>
                        {line.product ? (
                          <span className="text-[length:var(--text-caption)] text-ink-tertiary">
                            {line.product.sku}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-xs text-right tabular-nums text-[length:var(--text-body-sm)] text-ink">
                        {line.quantity.toString()}
                        {line.unit ? ` ${line.unit}` : ""}
                      </td>
                      <td className="py-xs text-right tabular-nums text-[length:var(--text-body-sm)] text-ink">
                        {formatMYR(line.unitPrice)}
                      </td>
                      <td className="py-xs text-right tabular-nums text-[length:var(--text-body-sm)] text-ink">
                        {formatMYR(line.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {[
                    { label: "Subtotal", value: po.subtotal, strong: false },
                    { label: "Tax", value: po.tax, strong: false },
                    { label: "Total", value: po.total, strong: true },
                  ].map(({ label, value, strong }) => (
                    <tr key={label}>
                      <td
                        colSpan={3}
                        className={`py-xxs text-right text-[length:var(--text-body-sm)] ${strong ? "font-semibold text-ink" : "text-ink-secondary"}`}
                      >
                        {label}
                      </td>
                      <td
                        className={`py-xxs text-right tabular-nums text-[length:var(--text-body-sm)] ${strong ? "font-semibold text-ink" : "text-ink-secondary"}`}
                      >
                        {formatMYR(value)}
                      </td>
                    </tr>
                  ))}
                </tfoot>
              </table>
            </div>
          </section>
        </div>
      </div>

      <ActivityList
        events={po.stageEvents.map((event) => ({
          id: event.id,
          kind: event.kind,
          fromStage: event.fromStage,
          toStage: event.toStage,
          note: event.note,
          changedAt: event.changedAt.toISOString(),
          changedByName: event.changedBy?.name ?? null,
        }))}
        confirmedAt={po.confirmedAt.toISOString()}
        confirmedByName={po.confirmedBy?.name ?? null}
      />
    </>
  );
}

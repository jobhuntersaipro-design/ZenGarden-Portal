import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { DocumentPreview } from "@/components/review/DocumentPreviewLoader";
import { BackLink } from "@/components/portal/BackLink";
import { PageHeader } from "@/components/portal/PageHeader";
import { StageBadge } from "@/components/portal/StatusBadge";
import { LifecycleFeed } from "@/components/purchase-orders/LifecycleFeed";
import { DownloadOriginal } from "@/components/purchase-orders/DownloadOriginal";
import { DeletePoDialog } from "@/components/purchase-orders/DeletePoDialog";
import { EditPurchaseOrderSheet } from "@/components/purchase-orders/EditPurchaseOrderSheet";
import { LifecycleActions } from "@/components/purchase-orders/LifecycleActions";
import { StageStepper } from "@/components/purchase-orders/StageStepper";
import { advanceKeyFor } from "@/lib/permissions/actions";
import { can, requirePagePermission, rolesWithPermission } from "@/lib/permissions/require";
import { roleLabel } from "@/lib/permissions/roles";
import { formatDate, formatDateTime, TIME_ZONE } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import {
  isFinalStage,
  nextStage,
  prevStage,
  stageIndex,
} from "@/lib/po-stages";
import { PO_STAGES } from "@/lib/po-stages";
import { ORDER_IDENTITY_SELECT, orderIdentity, orderLabel } from "@/lib/order-identity";
import { prisma } from "@/lib/prisma";
import { PersonChip } from "@/components/ui/person";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // The tab title names the record, so it answers the same question the
  // page does and is withheld on the same terms. `can`, not the page
  // guard: metadata has no 404 to render, it just says less.
  if (!(await can("po.view"))) return { title: "Purchase order · Zen Garden Portal" };
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: ORDER_IDENTITY_SELECT,
  });
  return {
    title: `${po ? orderLabel(orderIdentity(po)) : "Purchase order"} · Zen Garden Portal`,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function PurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Phase 48: this destination is what `po.view` names.
  await requirePagePermission("po.view");
  const { id } = await params;

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      buyer: true,
      document: { select: { id: true, originalName: true } },
      webOrder: { select: { id: true, reference: true } },
      confirmedBy: { select: { name: true, image: true, role: true } },
      lineItems: {
        orderBy: { position: "asc" },
        include: { product: { select: { name: true, sku: true } } },
      },
      stageEvents: {
        orderBy: { changedAt: "desc" },
        // `role` rides along with the name and picture: every row of the
        // feed below records what somebody did, and on this portal four ops
        // roles own different stage moves (Phase 48), so the job is part of
        // reading the history.
        include: { changedBy: { select: { name: true, image: true, role: true } } },
      },
      supersededBy: { select: { id: true, revision: true } },
      revisionOf: {
        select: { id: true, poNumber: true, confirmedAt: true, revision: true },
      },
    },
  });
  if (!po) notFound();

  // An old revision is not a page of its own: the current one is the record.
  if (po.supersededBy) redirect(`/purchase-orders/${po.supersededBy.id}`);

  // Order ID and PO number, never one for the other (2026-09-17).
  const identity = orderIdentity(po);
  const label = orderLabel(identity);

  const current = po.stage;

  // Phase 48. The Advance button is disabled rather than hidden off-stage, and
  // the caption names the role that does own it — a refusal that only says
  // "not you" sends someone to ask an admin instead of a colleague.
  const advanceKey = advanceKeyFor(current);
  const canAdvance = advanceKey ? await can(advanceKey) : false;
  const canDeleteOrder = await can("po.delete");
  const canEditOrder = await can("po.edit");
  let advanceBlockedReason: string | null = null;
  if (advanceKey && !canAdvance) {
    const owners = (await rolesWithPermission(advanceKey)).filter(
      (role) => role !== Role.SUPER_ADMIN,
    );
    advanceBlockedReason = owners.length
      ? `${owners.map(roleLabel).join(" or ")} advances this stage.`
      : "Only a super admin advances this stage.";
  }
  const daysFromOrder = Math.max(
    0,
    Math.round(
      (po.stageChangedAt.getTime() - po.confirmedAt.getTime()) / DAY_MS,
    ),
  );

  const latestStageEvent = po.stageEvents.find(
    (event) => event.kind === "STAGE",
  );
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

  /**
   * How the promised delivery date reads against today (Phase 38). Only while
   * the order is still moving: once it is delivered the date is history, and
   * "3 days overdue" on a delivered order would be wrong as well as unhelpful.
   */
  const deliveryNote =
    po.deliveryDate && !isFinalStage(current)
      ? (() => {
          const days = Math.round((po.deliveryDate.getTime() - now) / DAY_MS);
          if (days < 0) {
            const late = Math.abs(days);
            return {
              text: `Expected ${formatDate(po.deliveryDate)} · ${late} ${late === 1 ? "day" : "days"} overdue`,
              late: true,
            };
          }
          return {
            text: `Expected ${formatDate(po.deliveryDate)} · ${days === 0 ? "due today" : `in ${days} ${days === 1 ? "day" : "days"}`}`,
            late: false,
          };
        })()
      : null;

  return (
    <>
      {/* A detail page reached from four different places needs a way back:
          the explicit control first, the breadcrumb under it (brief G2). */}
      <BackLink fallbackHref="/purchase-orders" />
      <nav aria-label="Breadcrumb" className="mb-xs">
        <Link
          href="/purchase-orders"
          className="inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
        >
          Purchase orders
        </Link>
        <span className="text-[length:var(--text-body-sm)] text-ink-tertiary">
          {" / "}
          {label}
        </span>
      </nav>

      <PageHeader
        eyebrow={label}
        title={po.buyer.name}
        action={
          <div className="flex items-center gap-sm">
            {/* No status pill here (2026-09-18): the Status card below opens
                with the same badge, and the header's job is the actions. */}
            {po.revision > 1 ? (
              <span className="rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] text-ink-secondary">
                Rev {po.revision}
              </span>
            ) : null}
            {po.document ? (
              <DownloadOriginal documentId={po.document.id} />
            ) : null}
            {canEditOrder ? (
            <EditPurchaseOrderSheet
              poId={po.id}
              identity={identity}
              initial={{
                poDate: po.poDate.toISOString().slice(0, 10),
                deliveryDate: po.deliveryDate
                  ? po.deliveryDate.toISOString().slice(0, 10)
                  : null,
                paymentTerms: po.paymentTerms,
                notes: po.notes,
                // Typed per edit, never prefilled from the order.
                reason: null,
              }}
            />
            ) : null}
            {/* `po.delete`, here and in the list's last column. */}
            {canDeleteOrder ? (
              <DeletePoDialog
                poId={po.id}
                orderId={identity.orderId}
                poNumber={identity.poNumber}
                lineItemCount={po.lineItems.length}
                monthLabel={po.poDate.toLocaleDateString("en-GB", {
                  month: "long",
                  year: "numeric",
                  timeZone: TIME_ZONE,
                })}
                supersedesRevision={po.revisionOf?.revision ?? null}
                fromShop={po.webOrder !== null}
              />
            ) : null}
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
            {po.revisionOf.poNumber ?? "the previous revision"}
          </Link>
          , confirmed {formatDate(po.revisionOf.confirmedAt)}
        </p>
      ) : null}

      <section className="rounded-lg border border-hairline bg-canvas p-lg">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
              Status
            </p>
            {/* The stage is the status pill here too, so the name reads the
                same on the heading, the stepper and every feed row
                (2026-09-18); the counter beside it stays heading text. */}
            <h2 className="flex flex-wrap items-center gap-xs font-display text-[length:var(--text-heading-sm)] font-[650] tracking-[-0.54px] text-ink">
              <StageBadge stage={current} />
              {isFinalStage(current)
                ? `· ${daysFromOrder} days from order`
                : `· stage ${stageIndex(current) + 1} of ${PO_STAGES.length}`}
            </h2>
            <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
              {latestStageEvent?.changedBy?.name ? (
                <span className="inline-flex items-center gap-xxs align-middle">
                  Moved here by
                  <PersonChip
                    name={latestStageEvent.changedBy.name}
                    image={latestStageEvent.changedBy.image}
                    role={latestStageEvent.changedBy.role}
                  />
                </span>
              ) : (
                "Order placed by System"
              )}{" "}
              on {formatDate(enteredStageAt)} · {daysInStage}{" "}
              {daysInStage === 1 ? "day" : "days"} in this stage
              {/* The note that came with the move is no longer repeated here:
                  every note has a row in the feed below, where the ones left
                  on earlier stages are too (2026-09-18). */}
            </p>
            {/* Overdue is red, the one status palette — not a second scheme
                invented here. On time is the caption's own quiet grey: it is
                information, not an alarm. */}
            {deliveryNote ? (
              <p
                className={`mt-xxs text-[length:var(--text-caption)] ${deliveryNote.late ? "text-accent-red" : "text-ink-tertiary"}`}
              >
                {deliveryNote.text}
              </p>
            ) : null}
          </div>

          <LifecycleActions
            poId={po.id}
            next={nextStage(current)}
            previous={prevStage(current)}
            canAdvance={canAdvance}
            advanceBlockedReason={advanceBlockedReason}
            canMoveBack={await can("po.revert")}
          />
        </div>

        <StageStepper
          current={current}
          showActor
          events={po.stageEvents
            .filter((event) => event.kind === "STAGE")
            .map((event) => ({
              toStage: event.toStage,
              changedAt: event.changedAt.toISOString(),
              changedByName: event.changedBy?.name ?? null,
              changedByImage: event.changedBy?.image ?? null,
            }))}
        />

        {/* Notes and activity live with the lifecycle they describe
            (2026-09-18), not at the foot of the page. */}
        <LifecycleFeed
          events={po.stageEvents.map((event) => ({
            id: event.id,
            kind: event.kind,
            fromStage: event.fromStage,
            toStage: event.toStage,
            note: event.note,
            changedAt: event.changedAt.toISOString(),
            changedByName: event.changedBy?.name ?? null,
            changedByImage: event.changedBy?.image ?? null,
            changedByRole: event.changedBy?.role ?? null,
          }))}
          confirmedAt={po.confirmedAt.toISOString()}
          confirmedByName={po.confirmedBy?.name ?? null}
          confirmedByImage={po.confirmedBy?.image ?? null}
          confirmedByRole={po.confirmedBy?.role ?? null}
        />
      </section>

      {/* A grid item defaults to `min-width: auto`, so the track grew to the
          error card's max-content width and pushed the page 113px past a 390px
          viewport (2026-09-06 review). Both columns must be allowed to shrink. */}
      {/* With a document, the document is the primary pane (2026-09-17): the
          wide column, the viewport's height, held in view from `xl` while the
          summary rail beside it scrolls. Without one there is only a short
          note to show, so the old split stays. */}
      <div
        className={`mt-lg grid min-w-0 gap-lg ${po.document ? "xl:grid-cols-document" : "lg:grid-cols-[45fr_55fr]"}`}
      >
        <section
          className={`min-w-0 ${po.document ? "xl:sticky xl:top-md xl:self-start" : ""}`}
        >
          <p className="mb-xs font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            {/* Three cases now, not two: a scan the customer emailed, the
                purchase order we generated for an order placed on the shop
                (Phase 37), and an older shop order that has neither. */}
            {po.document
              ? po.webOrder
                ? "Purchase order · generated on the shop"
                : "Original document"
              : "Placed on the shop"}
          </p>
          {po.document ? (
            <>
              <DocumentPreview
                documentId={po.document.id}
                originalName={po.document.originalName}
              />
              {po.webOrder ? (
                <Link
                  href={`/web-orders/${po.webOrder.id}`}
                  className="mt-xs inline-block text-[length:var(--text-body-sm)] text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {`See what the buyer sent · ${po.webOrder.reference}`}
                </Link>
              ) : null}
            </>
          ) : (
            /* An order placed on the shop has no scan behind it. The pane says
               so rather than rendering a preview that can only fail — which is
               the reason a Document was not synthesised for it. */
            <div className="rounded-lg border border-hairline bg-surface p-lg">
              <p className="text-[length:var(--text-body-sm)] text-ink">
                This order was placed on the shop, so there is no document to
                show.
              </p>
              {po.webOrder ? (
                <Link
                  href={`/web-orders/${po.webOrder.id}`}
                  className="mt-xs inline-block text-[length:var(--text-body-sm)] text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {`See what the buyer sent · ${po.webOrder.reference}`}
                </Link>
              ) : null}
            </div>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-lg">
          {/* Container queries rather than viewport ones: the same card is a
              22rem rail beside the document and full width below `xl`. */}
          <section className="@container rounded-lg border border-hairline bg-canvas p-lg">
            <h2 className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
              Summary
            </h2>
            <dl className="grid gap-sm @sm:grid-cols-2">
              {[
                ["Order ID", identity.orderId ?? "—"],
                ["PO number", identity.poNumber ?? "—"],
                ["PO date", formatDate(po.poDate)],
                [
                  "Expected delivery",
                  po.deliveryDate ? formatDate(po.deliveryDate) : "—",
                ],
                ["Payment terms", po.paymentTerms ?? "—"],
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
              {/* Prose, so it wraps across the full width rather than
                  truncating — unlike every other row on this card, whose `dd`
                  sets `title={value}` and clips. */}
              <div className="@sm:col-span-2">
                <dt className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
                  Remark
                </dt>
                <dd className="whitespace-pre-wrap text-[length:var(--text-body-md)] text-ink">
                  {po.notes?.trim() ? po.notes : "—"}
                </dd>
              </div>
              {/* Its own block rather than a row in the map above: that map's
                  `dd` sets `title={value}` and expects a string. */}
              <div>
                <dt className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
                  Confirmed by
                </dt>
                <dd className="text-[length:var(--text-body-md)] text-ink">
                  {po.confirmedBy?.name ? (
                    <PersonChip
                      name={po.confirmedBy.name}
                      image={po.confirmedBy.image}
                    />
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
                  Buyer
                </dt>
                <dd className="truncate text-[length:var(--text-body-md)]">
                  <Link
                    href={`/buyers/${po.buyer.id}`}
                    title={po.buyer.name}
                    className="text-ink hover:text-brand-link hover:underline"
                  >
                    {po.buyer.name}
                  </Link>
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-hairline bg-canvas p-lg">
            <h2 className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
              Line items
            </h2>
            {/* A list rather than a four-column table since 2026-09-17: the
                card sits in a 22rem rail beside the document, where Qty, Unit
                price and Amount left the description a few characters wide.
                Not sortable: these are in the order they appear on the
                customer's document, which is what lets someone check them
                against the page beside it (design reference §4). */}
            <ul className="flex flex-col">
              {po.lineItems.map((line) => (
                <li
                  key={line.id}
                  className="border-b border-hairline py-xs first:pt-0"
                >
                  <div className="flex items-baseline justify-between gap-sm">
                    <span className="min-w-0 text-[length:var(--text-body-sm)] text-ink">
                      {line.description}
                    </span>
                    <span className="shrink-0 text-[length:var(--text-body-sm)] font-semibold tabular-nums text-ink">
                      {formatMYR(line.amount)}
                    </span>
                  </div>
                  {/* The code the document printed, not the catalogue's. They
                      are the same once a line is linked, but a line whose code
                      created nothing still has one to show. The unit stays
                      with the quantity and never joins the currency value
                      (brief G6). */}
                  <p className="mt-xxs text-[length:var(--text-caption)] tabular-nums text-ink-tertiary">
                    {[
                      line.sku ?? line.product?.sku,
                      `${line.quantity.toString()}${line.unit ? ` ${line.unit}` : ""} × ${formatMYR(line.unitPrice)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
            <dl className="pt-xs">
              {[
                { label: "Subtotal", value: po.subtotal, strong: false },
                // A zero tax is no tax — the same rule the document, the PDF
                // and the emails have always followed, and this was the one
                // place that printed "Tax MYR 0.00" anyway. Every order
                // confirmed since 2026-09-20 carries zero; an older one that
                // really has tax still shows it.
                ...(po.tax.isZero()
                  ? []
                  : [{ label: "Tax", value: po.tax, strong: false }]),
                { label: "Total", value: po.total, strong: true },
              ].map(({ label, value, strong }) => (
                <div
                  key={label}
                  className={`flex items-baseline justify-between gap-sm py-xxs text-[length:var(--text-body-sm)] ${strong ? "font-semibold text-ink" : "text-ink-secondary"}`}
                >
                  <dt>{label}</dt>
                  <dd className="tabular-nums">{formatMYR(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>

    </>
  );
}

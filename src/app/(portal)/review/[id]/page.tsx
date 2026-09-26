import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { can } from "@/lib/permissions/require";
import { ExtractionStatus } from "@/generated/prisma/enums";
import { DocumentPreview } from "@/components/review/DocumentPreviewLoader";
import { ReviewForm } from "@/components/review/ReviewForm";
import { RunningPoller } from "@/components/review/RunningPoller";
import { PageHeader } from "@/components/portal/PageHeader";
import { todayISO } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import type { PoDraft } from "@/lib/validation/purchase-orders";
import { withLoadingFloor } from "@/lib/loading-floor";

export const metadata: Metadata = { title: "Review · Zen Garden Portal" };
export const dynamic = "force-dynamic";

/** An empty draft, so a FAILED extraction can still be filled in by hand. */
const emptyDraft = (): PoDraft => ({
  poNumber: "",
  buyerId: null,
  newBuyerName: null,
  poDate: todayISO(),
  currency: "MYR",
  paymentTerms: null,
  lineItems: [
    {
      sku: null,
      description: "",
      productId: null,
      quantity: "1",
      unit: null,
      unitPrice: "0.00",
      amount: "0.00",
      productDecision: "unset",
    },
  ],
  subtotal: "0.00",
  tax: "0.00",
  total: "0.00",
});

/**
 * `draftJson` is whatever was last saved, which may be a Phase 03 buyer hint
 * rather than a full draft. Anything missing falls back to the empty draft, so
 * the form always has every key it renders.
 */
function toDraft(value: unknown): PoDraft {
  const base = emptyDraft();
  if (typeof value !== "object" || value === null || Array.isArray(value)) return base;
  const draft = { ...base, ...(value as Partial<PoDraft>) };
  if (!Array.isArray(draft.lineItems) || draft.lineItems.length === 0) {
    draft.lineItems = base.lineItems;
  }
  return draft;
}

/**
 * Whether this JSON carries a non-empty value for the field. PO number and PO
 * date are locked on this screen (2026-09-17) only when both Claude's output
 * and the draft hold one: a failed extraction has no `rawJson`, and a draft
 * missing the field falls back to "" or today in `toDraft` — locking either
 * would leave the reviewer unable to confirm, or confirming a date nobody read.
 */
function hasValue(raw: unknown, field: "poNumber" | "poDate"): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const value = (raw as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() !== "";
}

function confidenceMap(raw: unknown): Record<string, number> {
  if (typeof raw !== "object" || raw === null) return {};
  const fields = (raw as { confidence?: { fields?: unknown } }).confidence?.fields;
  if (typeof fields !== "object" || fields === null) return {};
  return Object.fromEntries(
    Object.entries(fields as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
}

async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Phase 48: reviewing an extraction is `po.review`.
  if (!(await can("po.review"))) notFound();
  const { id } = await params;
  const query = await searchParams;

  const extraction = await prisma.extraction.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      error: true,
      rawJson: true,
      draftJson: true,
      document: {
        select: { id: true, originalName: true, purchaseOrder: { select: { id: true } } },
      },
    },
  });
  if (!extraction) notFound();

  if (extraction.status === ExtractionStatus.CONFIRMED) {
    redirect(
      extraction.document.purchaseOrder
        ? `/purchase-orders/${extraction.document.purchaseOrder.id}`
        : "/purchase-orders",
    );
  }
  if (extraction.status === ExtractionStatus.DISCARDED) redirect("/upload");

  const [buyers, products] = await Promise.all([
    prisma.buyer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // The whole active catalogue, shaped as CatalogueEntry field for field.
    // Ranked candidates are deliberately not computed here and never stored in
    // draftJson: they are a view of the catalogue, and a draft can sit in the
    // queue for days while the catalogue moves. The client ranks them fresh,
    // which is also what lets an edited code re-rank live.
    prisma.product.findMany({
      where: { active: true },
      select: {
        id: true,
        sku: true,
        name: true,
        brand: true,
        variant: true,
        market: true,
        packSize: true,
        unit: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const raw = query.queue;
  const queue = (Array.isArray(raw) ? raw[0] : raw)?.split(",").filter(Boolean) ?? [];
  const position = queue.indexOf(id);

  const running =
    extraction.status === ExtractionStatus.RUNNING ||
    extraction.status === ExtractionStatus.PENDING;

  return (
    <>
      <PageHeader
        eyebrow={
          position >= 0 ? `Review ${position + 1} of ${queue.length}` : "Review"
        }
        title={extraction.document.originalName}
      />

      {running ? (
        <RunningPoller extractionId={id} />
      ) : (
        <ReviewForm
          document={
            <DocumentPreview
              documentId={extraction.document.id}
              originalName={extraction.document.originalName}
            />
          }
          locked={{
            poNumber:
              hasValue(extraction.rawJson, "poNumber") &&
              hasValue(extraction.draftJson, "poNumber"),
            poDate:
              hasValue(extraction.rawJson, "poDate") &&
              hasValue(extraction.draftJson, "poDate"),
          }}
          extractionId={id}
          status={extraction.status}
          extractionError={extraction.error}
          initialDraft={toDraft(extraction.draftJson)}
          confidence={confidenceMap(extraction.rawJson)}
          buyers={buyers.map((buyer) => ({ id: buyer.id, label: buyer.name }))}
          catalogue={products}
          queue={queue}
        />
      )}
    </>
  );
}

export default withLoadingFloor(ReviewPage);

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ExtractionStatus } from "@/generated/prisma/enums";
import { DocumentPreview } from "@/components/review/DocumentPreviewLoader";
import { ReviewForm } from "@/components/review/ReviewForm";
import { RunningPoller } from "@/components/review/RunningPoller";
import { PageHeader } from "@/components/portal/PageHeader";
import { todayISO } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import type { PoDraft } from "@/lib/validation/purchase-orders";

export const metadata: Metadata = { title: "Review · Loving Hands Portal" };
export const dynamic = "force-dynamic";

/** An empty draft, so a FAILED extraction can still be filled in by hand. */
const emptyDraft = (): PoDraft => ({
  poNumber: "",
  buyerId: null,
  newBuyerName: null,
  poDate: todayISO(),
  deliveryDate: null,
  currency: "MYR",
  buyerReference: null,
  paymentTerms: null,
  lineItems: [
    {
      description: "",
      productId: null,
      quantity: "1",
      unit: null,
      unitPrice: "0.00",
      amount: "0.00",
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

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, name: true, sku: true, unit: true },
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
        <div className="grid gap-xl lg:grid-cols-2">
          <DocumentPreview
            documentId={extraction.document.id}
            originalName={extraction.document.originalName}
          />
          <ReviewForm
            extractionId={id}
            status={extraction.status}
            extractionError={extraction.error}
            initialDraft={toDraft(extraction.draftJson)}
            confidence={confidenceMap(extraction.rawJson)}
            buyers={buyers.map((buyer) => ({ id: buyer.id, label: buyer.name }))}
            products={products.map((product) => ({
              id: product.id,
              label: product.name,
              hint: product.sku,
              unit: product.unit,
            }))}
            queue={queue}
          />
        </div>
      )}
    </>
  );
}

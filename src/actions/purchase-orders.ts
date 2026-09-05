"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import {
  ExtractionStatus,
  PoEventKind,
  PoStage,
} from "@/generated/prisma/enums";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { extractPurchaseOrder } from "@/lib/extraction/extract-po";
import { formatMYR } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getObjectBytes } from "@/lib/r2";
import {
  PoDraftSchema,
  checkTotals,
  confirmOptionsSchema,
  type PoDraft,
} from "@/lib/validation/purchase-orders";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const guard = async () => {
  try {
    return { user: await requireUser(), error: null as string | null };
  } catch (cause) {
    return {
      user: null,
      error:
        cause instanceof UnauthorizedError ? cause.message : "You are not signed in.",
    };
  }
};

/**
 * Stored as the reviewer types, so a refresh loses nothing. Shape only — a
 * half-filled draft is the normal state here and must still be saveable.
 */
export async function saveDraft(
  extractionId: string,
  draft: unknown,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  if (typeof draft !== "object" || draft === null) {
    return { success: false, error: "That draft could not be saved." };
  }

  try {
    const extraction = await prisma.extraction.findUnique({
      where: { id: extractionId },
      select: { status: true },
    });
    if (!extraction) return { success: false, error: "That file is gone." };
    // A confirmed or discarded extraction is finished; late keystrokes from a
    // stale tab must not overwrite it.
    if (
      extraction.status === ExtractionStatus.CONFIRMED ||
      extraction.status === ExtractionStatus.DISCARDED
    ) {
      return { success: false, error: "This one is already finished." };
    }

    await prisma.extraction.update({
      where: { id: extractionId },
      data: { draftJson: draft as Prisma.InputJsonValue },
    });
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[po] saveDraft", cause);
    return { success: false, error: "That draft could not be saved." };
  }
}

export type DuplicateMatch = {
  poId: string;
  poNumber: string;
  revision: number;
  confirmedAt: string;
};

/** The latest confirmed PO for this buyer and number, if there is one. */
export async function checkDuplicate(
  buyerId: string,
  poNumber: string,
): Promise<ActionResult<DuplicateMatch | null>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };
  if (!buyerId || !poNumber) return { success: true, data: null };

  try {
    const existing = await prisma.purchaseOrder.findFirst({
      where: { buyerId, poNumber },
      orderBy: { revision: "desc" },
      select: { id: true, poNumber: true, revision: true, confirmedAt: true },
    });
    return {
      success: true,
      data: existing
        ? {
            poId: existing.id,
            poNumber: existing.poNumber,
            revision: existing.revision,
            confirmedAt: existing.confirmedAt.toISOString(),
          }
        : null,
    };
  } catch (cause) {
    console.error("[po] checkDuplicate", cause);
    return { success: false, error: "We couldn't check for duplicates." };
  }
}

export type ConfirmResult = { poId: string; nextExtractionId: string | null };

/**
 * The next id in `?queue` after this one that is still worth opening — a
 * SUCCEEDED or FAILED extraction. Queue order is the user's order, so the
 * database result is filtered back through it rather than trusted for order.
 */
async function nextInQueue(
  queue: string[],
  currentId: string,
): Promise<string | null> {
  const index = queue.indexOf(currentId);
  const rest = index >= 0 ? queue.slice(index + 1) : queue.filter((id) => id !== currentId);
  if (rest.length === 0) return null;

  const open = await prisma.extraction.findMany({
    where: {
      id: { in: rest },
      status: { in: [ExtractionStatus.SUCCEEDED, ExtractionStatus.FAILED] },
    },
    select: { id: true },
  });
  const openIds = new Set(open.map((row) => row.id));
  return rest.find((id) => openIds.has(id)) ?? null;
}

/**
 * The only path that writes a PurchaseOrder. Everything before this is a draft.
 */
export async function confirmPurchaseOrder(
  extractionId: string,
  draft: unknown,
  options: unknown = {},
  queue: string[] = [],
): Promise<ActionResult<ConfirmResult>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsedDraft = PoDraftSchema.safeParse(draft);
  if (!parsedDraft.success) {
    return {
      success: false,
      error: parsedDraft.error.issues[0]?.message ?? "That draft is incomplete.",
    };
  }
  const parsedOptions = confirmOptionsSchema.safeParse(options);
  if (!parsedOptions.success) {
    return { success: false, error: "That request could not be read." };
  }
  const { revisedOf, totalsAcknowledged } = parsedOptions.data;
  const data: PoDraft = parsedDraft.data;

  // The client gate is convenience. This is the check: a draft whose totals
  // disagree cannot be saved by calling the action directly, only by fixing
  // the numbers or by acknowledging the difference on the record.
  const totals = checkTotals(data);
  if (!totals.matches && totalsAcknowledged !== true) {
    return { success: false, error: "The totals don't match the document." };
  }

  try {
    const poId = await prisma.$transaction(async (tx) => {
      const buyerId = data.buyerId
        ? data.buyerId
        : (
            await tx.buyer.upsert({
              where: { name: data.newBuyerName! },
              update: {},
              create: { name: data.newBuyerName! },
              select: { id: true },
            })
          ).id;

      let revision = 1;
      let revisionOfId: string | null = null;
      if (revisedOf) {
        const previous = await tx.purchaseOrder.findUnique({
          where: { id: revisedOf },
          select: { id: true, revision: true },
        });
        if (!previous) throw new Error("MISSING_REVISED");
        revision = previous.revision + 1;
        revisionOfId = previous.id;
      }

      const extraction = await tx.extraction.findUnique({
        where: { id: extractionId },
        select: { documentId: true, status: true },
      });
      if (!extraction) throw new Error("MISSING_EXTRACTION");
      if (extraction.status === ExtractionStatus.CONFIRMED) {
        throw new Error("ALREADY_CONFIRMED");
      }

      const po = await tx.purchaseOrder.create({
        data: {
          poNumber: data.poNumber,
          revision,
          revisionOfId,
          buyerId,
          poDate: new Date(data.poDate),
          deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : null,
          currency: data.currency,
          buyerReference: data.buyerReference,
          paymentTerms: data.paymentTerms,
          subtotal: new Prisma.Decimal(data.subtotal),
          tax: new Prisma.Decimal(data.tax),
          total: new Prisma.Decimal(data.total),
          notes: data.notes ?? null,
          documentId: extraction.documentId,
          confirmedById: user.id,
          stage: PoStage.ORDER_PLACED,
        },
        select: { id: true },
      });

      await tx.lineItem.createMany({
        data: data.lineItems.map((line, index) => ({
          purchaseOrderId: po.id,
          position: index,
          description: line.description,
          productId: line.productId ?? null,
          quantity: new Prisma.Decimal(line.quantity),
          unit: line.unit,
          unitPrice: new Prisma.Decimal(line.unitPrice),
          amount: new Prisma.Decimal(line.amount),
        })),
      });

      // changedById null renders as "System" — the confirm itself is not a
      // person moving the order along.
      await tx.poStageEvent.create({
        data: {
          purchaseOrderId: po.id,
          kind: PoEventKind.STAGE,
          toStage: PoStage.ORDER_PLACED,
          changedById: null,
        },
      });

      // The escape hatch is auditable: who accepted the mismatch, and by how
      // much. EDIT events are ignored by every analytics function.
      if (!totals.matches && totalsAcknowledged) {
        await tx.poStageEvent.create({
          data: {
            purchaseOrderId: po.id,
            kind: PoEventKind.EDIT,
            fromStage: PoStage.ORDER_PLACED,
            toStage: PoStage.ORDER_PLACED,
            changedById: user.id,
            note: `Confirmed with a totals mismatch: computed ${formatMYR(
              totals.computed,
            )}, document ${formatMYR(totals.document)}, difference ${formatMYR(
              totals.difference,
            )}`,
          },
        });
      }

      await tx.extraction.update({
        where: { id: extractionId },
        data: { status: ExtractionStatus.CONFIRMED },
      });

      return po.id;
    });

    revalidatePath("/purchase-orders");

    return {
      success: true,
      data: { poId, nextExtractionId: await nextInQueue(queue, extractionId) },
    };
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      return { success: false, error: "Someone confirmed this PO a moment ago." };
    }
    const message = cause instanceof Error ? cause.message : "";
    if (message === "ALREADY_CONFIRMED") {
      return { success: false, error: "This one is already confirmed." };
    }
    if (message === "MISSING_EXTRACTION" || message === "MISSING_REVISED") {
      return { success: false, error: "That file is gone." };
    }
    console.error("[po] confirmPurchaseOrder", cause);
    return { success: false, error: "We couldn't save that purchase order." };
  }
}

export async function discardExtraction(
  extractionId: string,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    await prisma.extraction.update({
      where: { id: extractionId },
      data: {
        status: ExtractionStatus.DISCARDED,
        discardedAt: new Date(),
      },
    });
    revalidatePath("/purchase-orders");
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[po] discardExtraction", cause);
    return { success: false, error: "We couldn't discard that file." };
  }
}

export type ExtractionStatusResult = {
  status: ExtractionStatus;
  error: string | null;
};

/** Polled every 3 s by the review screen while an extraction is RUNNING. */
export async function getExtractionStatus(
  extractionId: string,
): Promise<ActionResult<ExtractionStatusResult>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const extraction = await prisma.extraction.findUnique({
    where: { id: extractionId },
    select: { status: true, error: true },
  });
  if (!extraction) return { success: false, error: "That file is gone." };
  return {
    success: true,
    data: { status: extraction.status, error: extraction.error },
  };
}

/** Reruns extraction for a FAILED row, following the same steps as upload. */
export async function retryExtraction(
  extractionId: string,
): Promise<ActionResult<ExtractionStatusResult>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const extraction = await prisma.extraction.findUnique({
    where: { id: extractionId },
    select: {
      id: true,
      status: true,
      document: { select: { id: true, r2Key: true, mimeType: true } },
    },
  });
  if (!extraction) return { success: false, error: "That file is gone." };
  if (extraction.status !== ExtractionStatus.FAILED) {
    return { success: false, error: "That file isn't waiting on a retry." };
  }

  const { runExtraction } = await import("@/lib/extraction/run");
  const result = await runExtraction({
    extractionId: extraction.id,
    documentId: extraction.document.id,
    r2Key: extraction.document.r2Key,
    mimeType: extraction.document.mimeType,
    getBytes: getObjectBytes,
    extract: extractPurchaseOrder,
  });

  return { success: true, data: { status: result.status, error: result.error } };
}

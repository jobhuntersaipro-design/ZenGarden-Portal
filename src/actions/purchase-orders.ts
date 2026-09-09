"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import {
  ExtractionStatus,
  PoEventKind,
  PoStage,
  WebOrderStatus,
} from "@/generated/prisma/enums";
import {
  UnauthorizedError,
  requireSuperAdmin,
  requireUser,
} from "@/lib/auth-guards";
import { extractPurchaseOrder } from "@/lib/extraction/extract-po";
import { formatMYR } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { createProductsForLines } from "@/lib/extraction/resolve-products";
import { deleteObject, getObjectBytes, isPendingKey } from "@/lib/r2";
import {
  PoDraftSchema,
  checkTotals,
  confirmOptionsSchema,
  deletePurchaseOrderSchema,
  type PoDraft,
} from "@/lib/validation/purchase-orders";

export type ActionResult<T = undefined> =
  { success: true; data: T } | { success: false; error: string };

const guard = async () => {
  try {
    return { user: await requireUser(), error: null as string | null };
  } catch (cause) {
    return {
      user: null,
      error:
        cause instanceof UnauthorizedError
          ? cause.message
          : "You are not signed in.",
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
  /** False when the number was found under a different buyer. */
  sameBuyer: boolean;
  buyerName: string;
};

/**
 * The latest confirmed PO carrying this number.
 *
 * Keyed on the buyer alone this missed the case that actually happened: the
 * same document was confirmed twice sixteen minutes apart, the second time
 * against a buyer typed `STAR VALUE SDN BHD` rather than the
 * `STAR VALUE SDN BHD @ SVPP` created the first time, so no duplicate was
 * found and both orders went live (2026-09-09). A PO number is the customer's
 * own reference, so the same number under another name is nearly always one
 * company entered two ways — worth saying, even though it cannot be *proved*
 * a duplicate the way a match on the same buyer can, which is why only the
 * same-buyer case blocks Confirm.
 */
export async function checkDuplicate(
  buyerId: string,
  poNumber: string,
): Promise<ActionResult<DuplicateMatch | null>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };
  if (!buyerId || !poNumber) return { success: true, data: null };

  try {
    const found = async (where: Prisma.PurchaseOrderWhereInput) =>
      prisma.purchaseOrder.findFirst({
        where,
        orderBy: { revision: "desc" },
        select: {
          id: true,
          poNumber: true,
          revision: true,
          confirmedAt: true,
          buyerId: true,
          buyer: { select: { name: true } },
        },
      });

    const existing =
      (await found({ buyerId, poNumber })) ?? (await found({ poNumber }));

    return {
      success: true,
      data: existing
        ? {
            poId: existing.id,
            poNumber: existing.poNumber,
            revision: existing.revision,
            confirmedAt: existing.confirmedAt.toISOString(),
            sameBuyer: existing.buyerId === buyerId,
            buyerName: existing.buyer.name,
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
  const rest =
    index >= 0
      ? queue.slice(index + 1)
      : queue.filter((id) => id !== currentId);
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
 * The only code that writes a PurchaseOrder, its line items and its opening
 * stage event.
 *
 * Extracted in Phase 16 so an order placed on the shop goes through exactly
 * the same writer, the same per-line product decisions and the same audit
 * trail as one keyed from a scan. `confirmPurchaseOrder` keeps its public
 * signature and passes the document; `confirmWebOrder` passes null.
 *
 * Private on purpose: it takes an open transaction and assumes its caller has
 * already run the guard and the totals gate.
 */
export async function writePurchaseOrder(
  tx: Prisma.TransactionClient,
  input: {
    data: PoDraft;
    buyerId: string;
    /** Null for an order placed on the shop: there is no scan behind it. */
    documentId: string | null;
    confirmedById: string;
    revision: number;
    revisionOfId: string | null;
    totals: ReturnType<typeof checkTotals>;
    totalsAcknowledged: boolean;
    buyerReference?: string | null;
  },
): Promise<string> {
  const { data } = input;

  const po = await tx.purchaseOrder.create({
    data: {
      poNumber: data.poNumber,
      revision: input.revision,
      revisionOfId: input.revisionOfId,
      buyerId: input.buyerId,
      poDate: new Date(data.poDate),
      currency: data.currency,
      paymentTerms: data.paymentTerms,
      subtotal: new Prisma.Decimal(data.subtotal),
      tax: new Prisma.Decimal(data.tax),
      total: new Prisma.Decimal(data.total),
      notes: data.notes ?? null,
      // Omitted rather than nulled: on a create the two are the same, and
      // Prisma's optional-relation input does not accept an explicit null.
      documentId: input.documentId ?? undefined,
      buyerReference: input.buyerReference ?? null,
      confirmedById: input.confirmedById,
      stage: PoStage.ORDER_PLACED,
    },
    select: { id: true },
  });

  // A draft can sit in the queue for days; the product it points at may
  // have been archived or deleted since it was chosen.
  const linkedIds = [
    ...new Set(
      data.lineItems
        .filter((line) => line.productDecision === "linked")
        .map((line) => line.productId!),
    ),
  ];
  const live = new Set(
    (
      await tx.product.findMany({
        where: { id: { in: linkedIds }, active: true },
        select: { id: true },
      })
    ).map((product) => product.id),
  );
  const stale = data.lineItems.findIndex(
    (line) => line.productDecision === "linked" && !live.has(line.productId!),
  );
  if (stale >= 0) throw new Error(`STALE_PRODUCT:${stale + 1}`);

  // Only the lines asking to be created reach the write, and positions
  // are kept so ids map back to the right rows.
  const newLines = data.lineItems.filter(
    (line) => line.productDecision === "new",
  );
  const createdIds = await createProductsForLines(
    tx,
    newLines.map((line) => ({
      description: line.description,
      sku: line.sku,
      unit: line.unit,
      unitPrice: line.unitPrice,
    })),
  );
  const created = new Map(
    newLines.map((line, index) => [line, createdIds[index] ?? null]),
  );

  await tx.lineItem.createMany({
    data: data.lineItems.map((line, index) => ({
      purchaseOrderId: po.id,
      position: index,
      sku: line.sku?.trim() || null,
      description: line.description,
      productId:
        line.productDecision === "linked"
          ? line.productId!
          : line.productDecision === "new"
            ? (created.get(line) ?? null)
            : null,
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
  if (!input.totals.matches && input.totalsAcknowledged) {
    await tx.poStageEvent.create({
      data: {
        purchaseOrderId: po.id,
        kind: PoEventKind.EDIT,
        fromStage: PoStage.ORDER_PLACED,
        toStage: PoStage.ORDER_PLACED,
        changedById: input.confirmedById,
        note: `Confirmed with a totals mismatch: computed ${formatMYR(
          input.totals.computed,
        )}, document ${formatMYR(input.totals.document)}, difference ${formatMYR(
          input.totals.difference,
        )}`,
      },
    });
  }

  return po.id;
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
      error:
        parsedDraft.error.issues[0]?.message ?? "That draft is incomplete.",
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

  // Since Phase 12 the reviewer's decision is authoritative. Re-deriving
  // productId from the printed code here is what used to overwrite a
  // correction someone had made by hand.
  const undecided = data.lineItems.findIndex(
    (line) => line.productDecision === "unset",
  );
  if (undecided >= 0) {
    return {
      success: false,
      error: `Every line needs a product — line ${undecided + 1} is undecided.`,
    };
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

      const poId = await writePurchaseOrder(tx, {
        data,
        buyerId,
        documentId: extraction.documentId,
        confirmedById: user.id,
        revision,
        revisionOfId,
        totals,
        totalsAcknowledged: totalsAcknowledged === true,
      });

      await tx.extraction.update({
        where: { id: extractionId },
        data: { status: ExtractionStatus.CONFIRMED },
      });

      return poId;
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
      return {
        success: false,
        error: "Someone confirmed this PO a moment ago.",
      };
    }
    const message = cause instanceof Error ? cause.message : "";
    if (message === "ALREADY_CONFIRMED") {
      return { success: false, error: "This one is already confirmed." };
    }
    if (message === "MISSING_EXTRACTION" || message === "MISSING_REVISED") {
      return { success: false, error: "That file is gone." };
    }
    if (message.startsWith("STALE_PRODUCT:")) {
      return {
        success: false,
        error: `The product chosen for line ${message.split(":")[1]} is no longer in the catalogue. Choose another.`,
      };
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

  return {
    success: true,
    data: { status: result.status, error: result.error },
  };
}

/**
 * Hard delete, super admin only. Line items and stage events cascade; the
 * `Document` and its R2 object are kept deliberately, so the original PDF
 * survives and the upload can be re-reviewed rather than re-requested from
 * the buyer.
 *
 * The extraction goes back to SUCCEEDED. Leaving it CONFIRMED would strand the
 * document: in no queue, and with no order behind it.
 *
 * `revisionOfId` is ON DELETE SET NULL, so deleting a superseded original does
 * not error — it leaves the newer revision intact but unlinked. That is why
 * the dialog says so before you confirm.
 */
export async function deletePurchaseOrder(input: {
  id: string;
  typedPoNumber: string;
}): Promise<ActionResult> {
  const parsed = deletePurchaseOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Type the PO number to confirm." };
  }

  try {
    await requireSuperAdmin();

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, poNumber: true, documentId: true },
    });
    if (!po) return { success: false, error: "That order no longer exists." };

    // Same shape as deleteUser's email check in Phase 09.
    if (
      parsed.data.typedPoNumber.trim().toLowerCase() !==
      po.poNumber.trim().toLowerCase()
    ) {
      return { success: false, error: "That is not the PO number." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.delete({ where: { id: po.id } });
      // Guarded since Phase 16: documentId is nullable, and a null here would
      // become `IS NULL` and quietly match nothing.
      if (po.documentId) {
        await tx.extraction.updateMany({
          where: { documentId: po.documentId, status: "CONFIRMED" },
          data: { status: "SUCCEEDED" },
        });
      }
      // The mirror of the extraction going back to SUCCEEDED: a deleted order
      // returns to the queue rather than stranding its web order in CONFIRMED
      // pointing at a row that no longer exists.
      await tx.webOrder.updateMany({
        where: { purchaseOrderId: po.id },
        data: {
          status: WebOrderStatus.SUBMITTED,
          purchaseOrderId: null,
          reviewedById: null,
          reviewedAt: null,
        },
      });
    });

    revalidatePath("/purchase-orders");
    revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return { success: false, error: cause.message };
    }
    console.error("[po] deletePurchaseOrder", cause);
    return { success: false, error: "We could not delete that order." };
  }
}

/**
 * Removes an upload that never became an order — a draft, an extraction still
 * running, or one that failed — together with its stored file.
 *
 * Deliberately not the same thing as `discardExtraction`, which marks a file
 * DISCARDED and keeps it. This is for clearing the list.
 *
 * A CONFIRMED extraction is refused: that document belongs to a purchase
 * order, and removing it here would go around the super-admin gate on
 * deleting an order.
 */
export async function deleteUpload(
  extractionId: string,
): Promise<ActionResult> {
  try {
    await requireUser();

    const extraction = await prisma.extraction.findUnique({
      where: { id: extractionId },
      select: {
        id: true,
        status: true,
        document: { select: { id: true, r2Key: true, originalName: true } },
      },
    });
    if (!extraction?.document) {
      return { success: false, error: "That upload no longer exists." };
    }
    if (extraction.status === ExtractionStatus.CONFIRMED) {
      return {
        success: false,
        error: "That one is a confirmed order. Delete the order instead.",
      };
    }

    const { id: documentId, r2Key } = extraction.document;

    await prisma.$transaction(async (tx) => {
      // Every extraction for the document, not just this one: a retry leaves
      // more than one, and the document cannot go while any of them points at it.
      await tx.extraction.deleteMany({ where: { documentId } });
      await tx.document.delete({ where: { id: documentId } });
    });

    // After the rows, and never fatal. The user asked for the row gone; an
    // object left in R2 is cheaper than reporting a failure once the database
    // is already consistent.
    try {
      if (!isPendingKey(r2Key)) await deleteObject(r2Key);
    } catch (cause) {
      console.error("[po] deleteUpload could not remove the object", cause);
    }

    revalidatePath("/purchase-orders");
    revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return { success: false, error: cause.message };
    }
    console.error("[po] deleteUpload", cause);
    return { success: false, error: "We couldn't delete that upload." };
  }
}

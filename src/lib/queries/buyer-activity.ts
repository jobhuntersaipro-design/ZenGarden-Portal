import { AuditAction, PoEventKind, WebOrderStatus } from "@/generated/prisma/enums";
import { formatMYR } from "@/lib/money";
import { stageLabel } from "@/lib/po-stages";
import { prisma } from "@/lib/prisma";
import {
  ACTIVITY_KINDS,
  ACTIVITY_PAGE_SIZE,
  auditText,
  mergeActivity,
  readDetail,
  type ActivityEntry,
  type ActivityKind,
} from "@/lib/queries/buyer-activity-entries";
import { ATTEMPT_RETENTION_HOURS } from "@/lib/rate-limit";

// Re-exported rather than defined here: these live in
// `buyer-activity-entries.ts` because they must stay importable from a
// client component without dragging `prisma` into the browser bundle — see
// that file's doc comment. Re-exporting keeps every existing import path
// (`from "@/lib/queries/buyer-activity"`) working unchanged.
export { ACTIVITY_KINDS, ACTIVITY_PAGE_SIZE, auditText, mergeActivity, readDetail };
export type { ActivityEntry, ActivityKind };

const WEB_ORDER_STATUS: Record<WebOrderStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  RECEIVED: "Received",
  CONFIRMED: "Confirmed",
  DECLINED: "Declined",
};

export async function loadBuyerActivity(
  buyerId: string,
  { page, kind }: { page: number; kind: ActivityKind | "all" },
): Promise<{ entries: ActivityEntry[]; total: number; failedWindowHours: number }> {
  // Each source is bounded by what the requested page could possibly need, so
  // a customer with four years of orders does not load four years of rows.
  const take = page * ACTIVITY_PAGE_SIZE;
  const failedSince = new Date(Date.now() - ATTEMPT_RETENTION_HOURS * 3_600_000);

  const [
    signIns,
    changes,
    webOrders,
    purchaseOrders,
    stageEvents,
    contacts,
    signInCount,
    changeCount,
    webOrderCount,
    purchaseOrderCount,
    stageEventCount,
  ] = await Promise.all([
    // Split from the "change" read below rather than one query for the whole
    // buyer: one AuditEvent query serving two kinds under one `take` bound
    // would let a customer's frequent sign-ins push their rare edits outside
    // the window entirely — filtering to "Changes" would then show nothing
    // for edits that genuinely exist. Splitting by kind up front, each with
    // its own `take`, keeps every source below homogeneous over one kind.
    prisma.auditEvent.findMany({
      where: { buyerId, action: AuditAction.SIGNED_IN },
      orderBy: { at: "desc" },
      take,
      select: {
        id: true,
        action: true,
        at: true,
        detail: true,
        actor: { select: { name: true, image: true } },
        subjectUser: { select: { name: true } },
      },
    }),
    prisma.auditEvent.findMany({
      where: { buyerId, action: { not: AuditAction.SIGNED_IN } },
      orderBy: { at: "desc" },
      take,
      select: {
        id: true,
        action: true,
        at: true,
        detail: true,
        actor: { select: { name: true, image: true } },
        subjectUser: { select: { name: true } },
      },
    }),
    prisma.webOrder.findMany({
      where: { buyerId, status: { not: WebOrderStatus.DRAFT } },
      orderBy: { submittedAt: "desc" },
      take,
      select: {
        id: true,
        reference: true,
        status: true,
        submittedAt: true,
        createdAt: true,
        subtotal: true,
        placedBy: { select: { name: true, image: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { buyerId },
      orderBy: { confirmedAt: "desc" },
      take,
      select: {
        id: true,
        poNumber: true,
        total: true,
        confirmedAt: true,
        // The provenance sentence needs whoever *uploaded* the document, not
        // whoever *confirmed* the order — two different people on this
        // model, exactly why PoTable renders them as two separate columns.
        document: { select: { uploadedBy: { select: { name: true } } } },
        confirmedBy: { select: { name: true, image: true } },
      },
    }),
    prisma.poStageEvent.findMany({
      // `fromStage: null` is the confirm-time ORDER_PLACED event, which the
      // purchase-order entry beside it already says. EDIT events carry an ops
      // note and are not the customer's business.
      where: { kind: PoEventKind.STAGE, fromStage: { not: null }, purchaseOrder: { buyerId } },
      orderBy: { changedAt: "desc" },
      take,
      select: {
        id: true,
        toStage: true,
        changedAt: true,
        changedBy: { select: { name: true, image: true } },
        purchaseOrder: { select: { id: true, poNumber: true } },
      },
    }),
    prisma.user.findMany({ where: { buyerId }, select: { email: true } }),
    // The take-bounded reads above answer "what fits on this page"; these
    // answer "how many are there really" — each filtered exactly like its
    // sibling read, or the total printed in the footer would disagree with
    // the rows it is supposedly counting. mergeActivity's own all.length
    // would otherwise be the size of a *truncated* union: right only while
    // every source's real count fits inside `take`, wrong the moment a
    // buyer's history — up to 400 purchase orders in production — exceeds it.
    prisma.auditEvent.count({ where: { buyerId, action: AuditAction.SIGNED_IN } }),
    prisma.auditEvent.count({ where: { buyerId, action: { not: AuditAction.SIGNED_IN } } }),
    prisma.webOrder.count({ where: { buyerId, status: { not: WebOrderStatus.DRAFT } } }),
    prisma.purchaseOrder.count({ where: { buyerId } }),
    prisma.poStageEvent.count({
      where: { kind: PoEventKind.STAGE, fromStage: { not: null }, purchaseOrder: { buyerId } },
    }),
  ]);

  const emails = contacts.map((contact) => contact.email);
  const failedWhere = { email: { in: emails }, success: false, at: { gte: failedSince } };
  const failed =
    emails.length > 0
      ? await prisma.loginAttempt.findMany({
          where: failedWhere,
          orderBy: { at: "desc" },
          take,
          select: { id: true, email: true, at: true },
        })
      : [];
  // Same filter as the read above, or the "sign-in" total would disagree
  // with what the failed-sign-in rows on screen actually are. Skipped when
  // there are no contacts at all, matching the read's own short-circuit.
  const failedCount = emails.length > 0 ? await prisma.loginAttempt.count({ where: failedWhere }) : 0;

  const totalFor = (selected: ActivityKind | "all"): number => {
    switch (selected) {
      case "sign-in":
        return signInCount + failedCount;
      case "shop-order":
        return webOrderCount;
      case "purchase-order":
        return purchaseOrderCount + stageEventCount;
      case "change":
        return changeCount;
      case "all":
        return (
          signInCount + changeCount + webOrderCount + purchaseOrderCount + stageEventCount + failedCount
        );
    }
  };

  const toAuditEntry =
    (entryKind: ActivityKind) =>
    (event: (typeof signIns)[number]): ActivityEntry => ({
      id: `audit:${event.id}`,
      kind: entryKind,
      at: event.at.toISOString(),
      text: auditText({
        action: event.action,
        actorName: event.actor?.name ?? null,
        subjectName: event.subjectUser?.name ?? null,
        detail: event.detail,
      }),
      actor: event.actor ?? null,
      href: null,
    });

  const auditEntries: ActivityEntry[] = [
    ...signIns.map(toAuditEntry("sign-in")),
    ...changes.map(toAuditEntry("change")),
  ];

  const webEntries: ActivityEntry[] = webOrders.map((order) => ({
    id: `web:${order.id}`,
    kind: "shop-order",
    // `submittedAt` is nullable on the model only because a DRAFT cart has
    // none; every row reaching this query is filtered to a non-DRAFT status,
    // and the one and only place that leaves DRAFT (`submitWebOrder`) sets
    // `submittedAt` in the same update as the status change. `createdAt` is a
    // type-narrowing concession, not a code path this branch can reach.
    at: (order.submittedAt ?? order.createdAt).toISOString(),
    text: `${order.placedBy.name} placed ${order.reference} · ${formatMYR(
      order.subtotal.toString(),
    )} · ${WEB_ORDER_STATUS[order.status]}`,
    actor: order.placedBy,
    href: `/web-orders/${order.id}`,
  }));

  const poEntries: ActivityEntry[] = purchaseOrders.map((order) => ({
    id: `po:${order.id}`,
    kind: "purchase-order",
    at: order.confirmedAt.toISOString(),
    // `document` is null exactly when the order has no scan behind it — a
    // web order, confirmed straight from the shop cart.
    text: `${order.poNumber} confirmed · ${formatMYR(order.total.toString())} · ${
      order.document ? `uploaded by ${order.document.uploadedBy.name}` : "from the shop"
    }`,
    actor: order.confirmedBy,
    href: `/purchase-orders/${order.id}`,
  }));

  const stageEntries: ActivityEntry[] = stageEvents.map((event) => ({
    id: `stage:${event.id}`,
    kind: "purchase-order",
    at: event.changedAt.toISOString(),
    text: `${event.purchaseOrder.poNumber} → ${stageLabel(event.toStage)}${
      event.changedBy ? ` · by ${event.changedBy.name}` : ""
    }`,
    actor: event.changedBy ?? null,
    href: `/purchase-orders/${event.purchaseOrder.id}`,
  }));

  const failedEntries: ActivityEntry[] = failed.map((attempt) => ({
    id: `failed:${attempt.id}`,
    kind: "sign-in",
    at: attempt.at.toISOString(),
    text: `Failed sign-in for ${attempt.email}`,
    actor: null,
    href: null,
  }));

  return {
    ...mergeActivity(
      [auditEntries, webEntries, poEntries, stageEntries, failedEntries],
      { kind, page, size: ACTIVITY_PAGE_SIZE, total: totalFor(kind) },
    ),
    failedWindowHours: ATTEMPT_RETENTION_HOURS,
  };
}

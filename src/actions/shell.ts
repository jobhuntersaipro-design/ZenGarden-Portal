"use server";

import { requireUser } from "@/lib/auth-guards";
import { roleCan } from "@/lib/permissions/require";
import { prisma } from "@/lib/prisma";
import { listReviewQueue } from "@/lib/queries/purchase-orders";
import { formatMYR } from "@/lib/money";

type Result<T> = { success: true; data: T } | { success: false; error: string };

/** One row the ⌘K palette can jump to. */
export type CommandEntry = {
  id: string;
  label: string;
  description?: string;
  group: "Purchase orders" | "Buyers" | "Products";
  keywords: string[];
  href: string;
};

/** How many of the latest purchase orders the palette indexes. */
const PO_LIMIT = 300;

/**
 * What the command palette can jump to, read once when it first opens.
 *
 * Narrow selects, and only what this role may open: a row the reader cannot
 * view would answer with a 404, which is worse than not offering it. The
 * pages themselves are offered by the client, which already knows the nav.
 */
export async function loadCommandIndex(): Promise<Result<CommandEntry[]>> {
  try {
    const user = await requireUser();
    const [pos, buyers, products] = await Promise.all([
      roleCan(user.role, "po.view").then((ok) =>
        ok
          ? prisma.purchaseOrder.findMany({
              where: { supersededBy: { is: null } },
              orderBy: { poDate: "desc" },
              take: PO_LIMIT,
              select: {
                id: true,
                poNumber: true,
                buyerReference: true,
                buyer: { select: { name: true } },
                webOrder: { select: { reference: true } },
              },
            })
          : [],
      ),
      roleCan(user.role, "buyer.view").then((ok) =>
        ok
          ? prisma.buyer.findMany({
              orderBy: { name: "asc" },
              select: { id: true, name: true, market: true },
            })
          : [],
      ),
      roleCan(user.role, "product.view").then((ok) =>
        ok
          ? prisma.product.findMany({
              orderBy: { name: "asc" },
              select: { id: true, name: true, sku: true, market: true },
            })
          : [],
      ),
    ]);

    const entries: CommandEntry[] = [
      ...pos.map((po) => {
        const orderId = po.webOrder?.reference ?? null;
        const poNumber = po.poNumber ?? (orderId ? po.buyerReference : null);
        return {
          id: `po:${po.id}`,
          label: poNumber ? `PO number ${poNumber}` : `Order ID ${orderId ?? "—"}`,
          description: [po.buyer.name, poNumber && orderId ? `Order ID ${orderId}` : null]
            .filter(Boolean)
            .join(" · "),
          group: "Purchase orders" as const,
          keywords: [po.buyer.name, poNumber, orderId].filter(
            (value): value is string => Boolean(value),
          ),
          href: `/purchase-orders/${po.id}`,
        };
      }),
      ...buyers.map((buyer) => ({
        id: `buyer:${buyer.id}`,
        label: buyer.name,
        description: buyer.market ?? undefined,
        group: "Buyers" as const,
        keywords: [buyer.market].filter((value): value is string => Boolean(value)),
        href: `/buyers/${buyer.id}`,
      })),
      ...products.map((product) => ({
        id: `product:${product.id}`,
        label: product.name,
        description: [product.sku, product.market].filter(Boolean).join(" · "),
        group: "Products" as const,
        keywords: [product.sku, product.market].filter(
          (value): value is string => Boolean(value),
        ),
        href: `/products/${product.id}`,
      })),
    ];
    return { success: true, data: entries };
  } catch {
    return { success: false, error: "We couldn't load search. Try again." };
  }
}

/** One thing waiting on the team, for the notification center. */
export type ReviewNotification = {
  id: string;
  title: string;
  description: string;
  /** ISO, when it joined the queue. */
  at: string | null;
  href: string;
  kind: "shop" | "upload";
};

/** The longest list the bell shows; the queue itself has the rest. */
const NOTIFICATION_LIMIT = 20;

/**
 * The review queue as notifications: shop orders sent or received but not
 * confirmed, and uploads Claude has read. The same query the queue section
 * on `/purchase-orders` runs, so the bell and the section cannot disagree.
 */
export async function loadReviewNotifications(): Promise<Result<ReviewNotification[]>> {
  try {
    const user = await requireUser();
    if (!(await roleCan(user.role, "po.view"))) return { success: true, data: [] };
    const { rows } = await listReviewQueue();
    const data = rows.slice(0, NOTIFICATION_LIMIT).map((row) => {
      const shop = row.kind === "WEB";
      const name = row.orderId ?? row.poNumber ?? row.fileName ?? "a document";
      return {
        id: `${row.kind}:${row.id}`,
        title: shop
          ? `Shop order ${name} from ${row.buyerName}`
          : `Upload ready to review: ${name}`,
        description: shop
          ? `${row.itemCount} ${row.itemCount === 1 ? "line" : "lines"} · ${formatMYR(row.total.toString())} — confirm or decline it.`
          : `Claude has read it${row.buyerName ? ` (${row.buyerName})` : ""}. Check the fields and confirm.`,
        at: row.queuedAt ? row.queuedAt.toISOString() : null,
        href: shop ? `/web-orders/${row.id}` : `/review/${row.id}`,
        kind: shop ? ("shop" as const) : ("upload" as const),
      };
    });
    return { success: true, data };
  } catch {
    return { success: false, error: "We couldn't load notifications." };
  }
}

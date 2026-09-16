import { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  poListNeedsReviewQuery,
  poListQuery,
  poListReceivedQuery,
  poListSummaryQuery,
  type PoListFilters,
  type PoListRow,
  type PoListSortKey,
} from "@/lib/queries/po-list.sql";

export type ListResult = {
  rows: PoListRow[];
  total: number;
  sum: string;
  needsReview: number;
  received: number;
};

/**
 * One round trip per question: the page of rows, the summary over the same
 * filtered set, and the "Needs review" and "Received" counts with the status
 * filter lifted. Each chip's number therefore always matches the rows it
 * filters to.
 */
export async function listPurchaseOrders(
  filters: PoListFilters,
  sort: { key: PoListSortKey; dir: "asc" | "desc" },
  take: number,
  skip: number,
): Promise<ListResult> {
  const [rows, summary, needsReview, received] = await Promise.all([
    prisma.$queryRaw<PoListRow[]>(poListQuery(filters, sort, take, skip)),
    prisma.$queryRaw<{ count: number; total: Prisma.Decimal }[]>(
      poListSummaryQuery(filters),
    ),
    prisma.$queryRaw<{ count: number }[]>(poListNeedsReviewQuery(filters)),
    prisma.$queryRaw<{ count: number }[]>(poListReceivedQuery(filters)),
  ]);

  return {
    rows,
    total: summary[0]?.count ?? 0,
    sum: (summary[0]?.total ?? new Prisma.Decimal(0)).toString(),
    needsReview: needsReview[0]?.count ?? 0,
    received: received[0]?.count ?? 0,
  };
}

/** Options for the buyer and uploader selects on the filter row. */
export async function listFilterOptions() {
  const [buyers, uploaders] = await Promise.all([
    prisma.buyer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      // Staff only. Since Phase 37 a generated purchase order is a `Document`
      // whose uploader is the *buyer's* contact, so without this clause a
      // customer's name appears in an ops filter — and picking it would show
      // one buyer's orders under a person who never uploaded anything.
      where: { documents: { some: {} }, role: { not: Role.CLIENT } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { buyers, uploaders };
}

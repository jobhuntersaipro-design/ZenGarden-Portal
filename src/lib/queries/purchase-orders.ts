import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  poListNeedsReviewQuery,
  poListQuery,
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
};

/**
 * One round trip per question: the page of rows, the summary over the same
 * filtered set, and the "Needs review" count with the status filter lifted.
 * The chip's number therefore always matches the rows it filters to.
 */
export async function listPurchaseOrders(
  filters: PoListFilters,
  sort: { key: PoListSortKey; dir: "asc" | "desc" },
  take: number,
  skip: number,
): Promise<ListResult> {
  const [rows, summary, needsReview] = await Promise.all([
    prisma.$queryRaw<PoListRow[]>(poListQuery(filters, sort, take, skip)),
    prisma.$queryRaw<{ count: number; total: Prisma.Decimal }[]>(
      poListSummaryQuery(filters),
    ),
    prisma.$queryRaw<{ count: number }[]>(poListNeedsReviewQuery(filters)),
  ]);

  return {
    rows,
    total: summary[0]?.count ?? 0,
    sum: (summary[0]?.total ?? new Prisma.Decimal(0)).toString(),
    needsReview: needsReview[0]?.count ?? 0,
  };
}

/** Options for the buyer and uploader selects on the filter row. */
export async function listFilterOptions() {
  const [buyers, uploaders] = await Promise.all([
    prisma.buyer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { documents: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { buyers, uploaders };
}

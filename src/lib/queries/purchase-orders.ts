import { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  poListQuery,
  poListSummaryQuery,
  poReviewQueueQuery,
  poReviewQueueSummaryQuery,
  type PoListFilters,
  type PoListRow,
  type PoListSortKey,
} from "@/lib/queries/po-list.sql";

export type ListResult = {
  rows: PoListRow[];
  total: number;
  sum: string;
};

/**
 * One round trip per question: the page of rows and the summary over the same
 * filtered set. Everything waiting on the team is not in it — see
 * `listReviewQueue` (Phase 46).
 */
export async function listPurchaseOrders(
  filters: PoListFilters,
  sort: { key: PoListSortKey; dir: "asc" | "desc" },
  take: number,
  skip: number,
): Promise<ListResult> {
  const [rows, summary] = await Promise.all([
    prisma.$queryRaw<PoListRow[]>(poListQuery(filters, sort, take, skip)),
    prisma.$queryRaw<{ count: number; total: Prisma.Decimal }[]>(
      poListSummaryQuery(filters),
    ),
  ]);

  return {
    rows,
    total: summary[0]?.count ?? 0,
    sum: (summary[0]?.total ?? new Prisma.Decimal(0)).toString(),
  };
}

/**
 * The review queue above the table (Phase 46): every row, unpaged and
 * unfiltered, longest waiting first. Its length is the sidebar's number.
 */
export async function listReviewQueue(): Promise<{ rows: PoListRow[]; sum: string }> {
  const [rows, summary] = await Promise.all([
    prisma.$queryRaw<PoListRow[]>(poReviewQueueQuery()),
    prisma.$queryRaw<{ total: Prisma.Decimal }[]>(poReviewQueueSummaryQuery()),
  ]);
  return {
    rows,
    sum: (summary[0]?.total ?? new Prisma.Decimal(0)).toString(),
  };
}

/**
 * The sidebar's number: the queue's own summary query, so the badge and the
 * section can never count different rows. One aggregate per shell render.
 */
export async function reviewQueueCount(): Promise<number> {
  const summary = await prisma.$queryRaw<{ count: number }[]>(
    poReviewQueueSummaryQuery(),
  );
  return summary[0]?.count ?? 0;
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

import { Prisma } from "@/generated/prisma/client";

/**
 * Sort keys the list offers. This is an allow-list, and it is the only reason
 * a key is safe to place in an ORDER BY: `parseSort` rejects anything that is
 * not here before it reaches the query.
 */
export const PO_LIST_SORT_KEYS = [
  "poNumber",
  "buyerName",
  "poDate",
  "itemCount",
  "total",
  "status",
  "uploadedBy",
  "confirmedBy",
] as const;

export type PoListSortKey = (typeof PO_LIST_SORT_KEYS)[number];

/** The column each sort key maps to. Never the formatted string. */
const ORDER_COLUMNS: Record<PoListSortKey, string> = {
  poNumber: 'merged."poNumber"',
  buyerName: 'lower(merged."buyerName")',
  poDate: 'merged."poDate"',
  itemCount: 'merged."itemCount"',
  total: 'merged."total"',
  status: 'merged."sortStatus"',
  uploadedBy: 'lower(merged."uploadedByName")',
  confirmedBy: 'lower(merged."confirmedByName")',
};

/**
 * A draft has nobody in "Confirmed by", and the spec wants those rows first
 * when the column is sorted ascending — the backlog is what someone opens this
 * page for. Postgres defaults ASC to NULLS LAST, so it has to be asked.
 */
const NULLS_FIRST_ON_ASC: readonly PoListSortKey[] = ["confirmedBy"];

export type PoListRow = {
  id: string;
  kind: "PO" | "DRAFT";
  poNumber: string;
  buyerName: string;
  buyerId: string | null;
  poDate: Date | null;
  itemCount: number;
  total: Prisma.Decimal;
  status: string;
  stage: string | null;
  uploadedByName: string | null;
  uploadedByImage: string | null;
  confirmedByName: string | null;
  confirmedByImage: string | null;
  fileType: string;
  revision: number;
};

export type PoListFilters = {
  q?: string;
  buyerId?: string;
  uploadedById?: string;
  status?: "all" | "confirmed" | "needs-review" | "extracting" | "failed";
  stage?: string;
  from?: Date;
  to?: Date;
};

/**
 * One list, two tables. Confirmed purchase orders and the extractions still in
 * flight are the same queue to the person reading it, and they have to sort and
 * paginate together — which Prisma's query API cannot express across two
 * tables. Hence raw SQL, with every value bound as a parameter and only the
 * ORDER BY built from the allow-list above.
 *
 * Only the latest revision of a PO appears: a superseded row is reachable from
 * the revision that replaced it, not from the list.
 */
export function poListQuery(
  filters: PoListFilters,
  sort: { key: PoListSortKey; dir: "asc" | "desc" },
  limit: number,
  offset: number,
): Prisma.Sql {
  const direction = sort.dir === "asc" ? Prisma.raw("ASC") : Prisma.raw("DESC");
  const orderColumn = Prisma.raw(ORDER_COLUMNS[sort.key]);
  const nulls = Prisma.raw(
    sort.dir === "asc" && NULLS_FIRST_ON_ASC.includes(sort.key)
      ? "NULLS FIRST"
      : "NULLS LAST",
  );

  // The union goes in a FROM clause rather than being ordered directly:
  // Postgres only allows result column names in a UNION's own ORDER BY, and
  // half of these sorts are expressions (`lower(...)`, for case-insensitive
  // text). Wrapping also lets the tie-break on "poNumber" stay stable.
  return Prisma.sql`
    SELECT * FROM (${baseSelect(filters)}) AS merged
    ORDER BY ${orderColumn} ${direction} ${nulls}, merged."poNumber" ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

/** Count and money sum over the same filtered set the table shows. */
export function poListSummaryQuery(filters: PoListFilters): Prisma.Sql {
  return Prisma.sql`
    SELECT COUNT(*)::int AS "count", COALESCE(SUM("total"), 0) AS "total"
    FROM (${baseSelect(filters)}) AS merged
  `;
}

/**
 * The "Needs review" chip's number: the same filtered set with the status
 * filter removed, so the count always matches the rows the chip filters to.
 */
export function poListNeedsReviewQuery(filters: PoListFilters): Prisma.Sql {
  return Prisma.sql`
    SELECT COUNT(*)::int AS "count"
    FROM (${baseSelect({ ...filters, status: "needs-review" })}) AS merged
  `;
}

const includesDrafts = (status: PoListFilters["status"]) =>
  status === undefined ||
  status === "all" ||
  status === "needs-review" ||
  status === "extracting" ||
  status === "failed";

const includesOrders = (status: PoListFilters["status"]) =>
  status === undefined || status === "all" || status === "confirmed";

function baseSelect(filters: PoListFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (includesOrders(filters.status)) parts.push(orderRows(filters));
  if (includesDrafts(filters.status)) parts.push(draftRows(filters));
  // A status that matches neither source still has to return the row shape.
  if (parts.length === 0) return Prisma.sql`${orderRows(filters)} AND FALSE`;
  return parts.length === 1
    ? parts[0]
    : Prisma.sql`${parts[0]} UNION ALL ${parts[1]}`;
}

function orderRows(filters: PoListFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    // Latest revision only: a superseded PO is reached through the one that
    // replaced it.
    Prisma.sql`NOT EXISTS (SELECT 1 FROM "PurchaseOrder" newer WHERE newer."revisionOfId" = po."id")`,
  ];

  if (filters.buyerId) conditions.push(Prisma.sql`po."buyerId" = ${filters.buyerId}`);
  if (filters.uploadedById) {
    conditions.push(Prisma.sql`doc."uploadedById" = ${filters.uploadedById}`);
  }
  if (filters.from) conditions.push(Prisma.sql`po."poDate" >= ${filters.from}`);
  if (filters.to) conditions.push(Prisma.sql`po."poDate" <= ${filters.to}`);
  if (filters.stage === "not-delivered") {
    conditions.push(Prisma.sql`po."stage" <> 'DELIVERED'`);
  } else if (filters.stage) {
    conditions.push(Prisma.sql`po."stage"::text = ${filters.stage}`);
  }
  if (filters.q) {
    const like = `%${filters.q}%`;
    conditions.push(Prisma.sql`(
      po."poNumber" ILIKE ${like}
      OR buyer."name" ILIKE ${like}
      OR EXISTS (
        SELECT 1 FROM "LineItem" li
        WHERE li."purchaseOrderId" = po."id" AND li."description" ILIKE ${like}
      )
    )`);
  }

  return Prisma.sql`
    SELECT
      po."id"                                   AS "id",
      'PO'                                      AS "kind",
      po."poNumber"                             AS "poNumber",
      buyer."name"                              AS "buyerName",
      buyer."id"                                AS "buyerId",
      po."poDate"                               AS "poDate",
      (SELECT COUNT(*)::int FROM "LineItem" li WHERE li."purchaseOrderId" = po."id") AS "itemCount",
      po."total"                                AS "total",
      po."stage"::text                          AS "status",
      po."stage"::text                          AS "stage",
      uploader."name"                           AS "uploadedByName",
      uploader."image"                          AS "uploadedByImage",
      confirmer."name"                          AS "confirmedByName",
      confirmer."image"                         AS "confirmedByImage",
      doc."mimeType"                            AS "fileType",
      po."revision"                             AS "revision",
      -- Confirmed rows sort after the backlog on a status sort: the queue is
      -- what someone opens this page for.
      1                                         AS "sortStatus"
    FROM "PurchaseOrder" po
    JOIN "Buyer" buyer      ON buyer."id" = po."buyerId"
    JOIN "Document" doc     ON doc."id" = po."documentId"
    JOIN "User" uploader    ON uploader."id" = doc."uploadedById"
    LEFT JOIN "User" confirmer ON confirmer."id" = po."confirmedById"
    WHERE ${Prisma.join(conditions, " AND ")}
  `;
}

function draftRows(filters: PoListFilters): Prisma.Sql {
  const statuses =
    filters.status === "needs-review"
      ? [Prisma.sql`'SUCCEEDED'`]
      : filters.status === "extracting"
        ? [Prisma.sql`'RUNNING'`, Prisma.sql`'PENDING'`]
        : filters.status === "failed"
          ? [Prisma.sql`'FAILED'`]
          : [
              Prisma.sql`'SUCCEEDED'`,
              Prisma.sql`'RUNNING'`,
              Prisma.sql`'PENDING'`,
              Prisma.sql`'FAILED'`,
            ];

  const conditions: Prisma.Sql[] = [
    Prisma.sql`ext."status"::text IN (${Prisma.join(statuses, ", ")})`,
  ];

  if (filters.uploadedById) {
    conditions.push(Prisma.sql`doc."uploadedById" = ${filters.uploadedById}`);
  }
  // A draft has no buyer and no PO date yet, so a filter on either excludes it
  // rather than matching everything.
  if (filters.buyerId) conditions.push(Prisma.sql`FALSE`);
  if (filters.from || filters.to) conditions.push(Prisma.sql`FALSE`);
  if (filters.stage) conditions.push(Prisma.sql`FALSE`);
  if (filters.q) {
    const like = `%${filters.q}%`;
    conditions.push(
      Prisma.sql`(doc."originalName" ILIKE ${like} OR ext."draftJson"::text ILIKE ${like})`,
    );
  }

  return Prisma.sql`
    SELECT
      ext."id"                                  AS "id",
      'DRAFT'                                   AS "kind",
      COALESCE(ext."draftJson"->>'poNumber', doc."originalName") AS "poNumber",
      COALESCE(ext."draftJson"->>'newBuyerName', '—')            AS "buyerName",
      NULL                                      AS "buyerId",
      NULL::date                                AS "poDate",
      COALESCE(jsonb_array_length(CASE
        WHEN jsonb_typeof(ext."draftJson"->'lineItems') = 'array'
        THEN ext."draftJson"->'lineItems' END), 0)::int          AS "itemCount",
      COALESCE(NULLIF(ext."draftJson"->>'total', '')::numeric, 0) AS "total",
      CASE ext."status"::text
        WHEN 'SUCCEEDED' THEN 'NEEDS_REVIEW'
        WHEN 'FAILED'    THEN 'FAILED'
        ELSE 'EXTRACTING'
      END                                       AS "status",
      NULL                                      AS "stage",
      uploader."name"                           AS "uploadedByName",
      uploader."image"                          AS "uploadedByImage",
      NULL                                      AS "confirmedByName",
      NULL                                      AS "confirmedByImage",
      doc."mimeType"                            AS "fileType",
      1                                         AS "revision",
      0                                         AS "sortStatus"
    FROM "Extraction" ext
    JOIN "Document" doc  ON doc."id" = ext."documentId"
    JOIN "User" uploader ON uploader."id" = doc."uploadedById"
    WHERE ${Prisma.join(conditions, " AND ")}
  `;
}

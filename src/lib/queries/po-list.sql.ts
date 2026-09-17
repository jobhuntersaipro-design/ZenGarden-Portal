import { dateColumnRange } from "@/lib/dates";
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
  "source",
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
  source: 'merged."source"',
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
  kind: "PO" | "DRAFT" | "WEB";
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
  /** Where the order came from: `web` for one placed on the shop (Phase 37). */
  source: "web" | "scan";
  revision: number;
  /**
   * When the row joined its list: a shop order's send, an upload's arrival, a
   * purchase order's confirmation. Orders the review queue, longest waiting
   * first (Phase 46).
   */
  queuedAt: Date | null;
};

export type PoListFilters = {
  q?: string;
  buyerId?: string;
  uploadedById?: string;
  /**
   * The main table's chips. Since Phase 46 nothing waiting on the team is in
   * that table — it has its own section, `poReviewQueueQuery` — so the
   * "needs-review", "received" and "shop-open" filters that used to reach it
   * are gone.
   */
  status?: "all" | "confirmed" | "extracting" | "failed" | "web";
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
  // A draft or an unconfirmed shop order has no PO date, so NULLS LAST would
  // file the backlog behind every confirmed order — on the last page of the
  // default sort. Pinned first in both directions; the date orders the rest.
  const backlogFirst = Prisma.raw(
    sort.key === "poDate" ? 'merged."sortStatus" ASC, ' : "",
  );

  // The union goes in a FROM clause rather than being ordered directly:
  // Postgres only allows result column names in a UNION's own ORDER BY, and
  // half of these sorts are expressions (`lower(...)`, for case-insensitive
  // text). Wrapping also lets the tie-break on "poNumber" stay stable.
  return Prisma.sql`
    SELECT * FROM (${baseSelect(filters)}) AS merged
    ORDER BY ${backlogFirst}${orderColumn} ${direction} ${nulls}, merged."poNumber" ASC
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
 * The review queue (Phase 46): everything waiting on a person — shop orders
 * sent or received but not yet confirmed, and uploads Claude has read and
 * nobody has reviewed. It ignores the page's filters on purpose: it is the
 * team's inbox, and a search for one buyer must not hide another's order.
 *
 * Longest waiting first, because that is the order the work should be done
 * in. The sidebar's count is `poReviewQueueSummaryQuery` over the same rows.
 */
export function poReviewQueueQuery(): Prisma.Sql {
  return Prisma.sql`
    SELECT * FROM (${reviewQueueSelect()}) AS merged
    ORDER BY merged."queuedAt" ASC NULLS LAST, merged."poNumber" ASC
  `;
}

/** The queue's count and money, over exactly the rows the section shows. */
export function poReviewQueueSummaryQuery(): Prisma.Sql {
  return Prisma.sql`
    SELECT COUNT(*)::int AS "count", COALESCE(SUM("total"), 0) AS "total"
    FROM (${reviewQueueSelect()}) AS merged
  `;
}

const reviewQueueSelect = () =>
  Prisma.sql`${draftRows({}, "review")} UNION ALL ${webOrderRows()}`;

const includesDrafts = (status: PoListFilters["status"]) =>
  status === undefined ||
  status === "all" ||
  status === "extracting" ||
  status === "failed";

/**
 * `"web"` now belongs here too: since a shop order can be confirmed into a
 * real `PurchaseOrder` row, the chip that claims "from the shop" has to reach
 * a confirmed one there, not just the still-pending row in `WebOrder`.
 */
const includesOrders = (status: PoListFilters["status"]) =>
  status === undefined ||
  status === "all" ||
  status === "confirmed" ||
  status === "web";

function baseSelect(filters: PoListFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (includesOrders(filters.status)) parts.push(orderRows(filters));
  // Never the shop branch, and never a draft ready for review: both are in the
  // review queue above the table (Phase 46), and each order appears once.
  if (includesDrafts(filters.status)) parts.push(draftRows(filters, "table"));
  // A status that matches no source still has to return the row shape.
  if (parts.length === 0) return Prisma.sql`${orderRows(filters)} AND FALSE`;
  return parts.reduce((left, right) => Prisma.sql`${left} UNION ALL ${right}`);
}

/**
 * Orders placed on the shop and waiting for someone to confirm them — the
 * review queue's shop half.
 *
 * Never widened past `SUBMITTED`/`RECEIVED`: a DRAFT is a client's live cart,
 * and the one thing that must never happen is a half-assembled cart appearing
 * in the ops queue. Takes no filters, because the queue ignores them.
 */
function webOrderRows(): Prisma.Sql {
  return Prisma.sql`
    SELECT
      wo."id"                                   AS "id",
      'WEB'                                     AS "kind",
      wo."reference"                            AS "poNumber",
      buyer."name"                              AS "buyerName",
      wo."buyerId"                              AS "buyerId",
      NULL::date                                AS "poDate",
      (SELECT COUNT(*)::int FROM "WebOrderLine" wl WHERE wl."webOrderId" = wo."id") AS "itemCount",
      wo."subtotal"                             AS "total",
      -- Not the raw status: IntakeStatus (the type StatusBadge renders
      -- against) has NEEDS_REVIEW but no SUBMITTED, so a raw 'SUBMITTED'
      -- would make the badge throw. A submitted row keeps NEEDS_REVIEW; a
      -- received one carries RECEIVED, which Task 9 adds a badge for.
      CASE WHEN wo."status" = 'RECEIVED' THEN 'RECEIVED' ELSE 'NEEDS_REVIEW' END AS "status",
      NULL                                      AS "stage",
      NULL                                      AS "uploadedByName",
      NULL                                      AS "uploadedByImage",
      NULL                                      AS "confirmedByName",
      NULL                                      AS "confirmedByImage",
      'web'                                     AS "fileType",
      'web'                                     AS "source",
      1                                         AS "revision",
      wo."submittedAt"                          AS "queuedAt",
      0                                         AS "sortStatus"
    FROM "WebOrder" wo
    JOIN "Buyer" buyer ON buyer."id" = wo."buyerId"
    WHERE wo."status" IN ('SUBMITTED', 'RECEIVED')
  `;
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
  // `poDate` is `@db.Date`, so both bounds are compared as calendar days in
  // Kuala Lumpur rather than as instants — see `dateColumnRange`. Without it a
  // KL-midnight `from` truncates to the previous UTC day and the list returns
  // one day more than the range it claims.
  if (filters.from || filters.to) {
    const bounds = dateColumnRange({
      from: filters.from ?? filters.to!,
      to: filters.to ?? filters.from!,
    });
    if (filters.from) conditions.push(Prisma.sql`po."poDate" >= ${bounds.gte}`);
    if (filters.to) conditions.push(Prisma.sql`po."poDate" <= ${bounds.lte}`);
  }
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
  // The Source column calls these rows "Shop"; the chip must agree with it.
  if (filters.status === "web") {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "WebOrder" w WHERE w."purchaseOrderId" = po."id")`,
    );
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
      COALESCE(doc."mimeType", 'web')           AS "fileType",
      -- Where the order came from, asked directly rather than inferred.
      -- Until Phase 37 a shop order had no document at all, so a null
      -- uploader meant "from the shop"; now it has one, whose uploader is the
      -- *buyer's own contact* — and the list would have printed a customer's
      -- name in the Uploaded by column.
      CASE WHEN EXISTS (
        SELECT 1 FROM "WebOrder" wo2 WHERE wo2."purchaseOrderId" = po."id"
      ) THEN 'web' ELSE 'scan' END              AS "source",
      po."revision"                             AS "revision",
      po."confirmedAt"                          AS "queuedAt",
      -- Confirmed rows sort after the backlog on a status sort, and on a PO
      -- date sort too (see poListQuery): the queue is what someone opens this
      -- page for.
      1                                         AS "sortStatus"
    FROM "PurchaseOrder" po
    JOIN "Buyer" buyer      ON buyer."id" = po."buyerId"
    -- LEFT, not INNER, since Phase 16. An order placed on the shop has no
    -- document, and an inner join here makes every one of them vanish from
    -- this list, from its money summary, from the needs-review count and from
    -- the buyer page — with no error and no type failure. po-list.sql.test.ts
    -- exists for exactly this line.
    LEFT JOIN "Document" doc   ON doc."id" = po."documentId"
    LEFT JOIN "User" uploader  ON uploader."id" = doc."uploadedById"
    LEFT JOIN "User" confirmer ON confirmer."id" = po."confirmedById"
    WHERE ${Prisma.join(conditions, " AND ")}
  `;
}

/**
 * Uploads that have not become orders. `review` is the queue's half — read by
 * Claude and waiting on a person; `table` is every other state, which stays in
 * the main table under its Extracting and Failed chips.
 */
function draftRows(filters: PoListFilters, part: "review" | "table"): Prisma.Sql {
  const statuses =
    part === "review"
      ? [Prisma.sql`'SUCCEEDED'`]
      : filters.status === "extracting"
        ? [Prisma.sql`'RUNNING'`, Prisma.sql`'PENDING'`]
        : filters.status === "failed"
          ? [Prisma.sql`'FAILED'`]
          : [Prisma.sql`'RUNNING'`, Prisma.sql`'PENDING'`, Prisma.sql`'FAILED'`];

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
      'scan'                                    AS "source",
      1                                         AS "revision",
      doc."uploadedAt"                          AS "queuedAt",
      0                                         AS "sortStatus"
    FROM "Extraction" ext
    JOIN "Document" doc  ON doc."id" = ext."documentId"
    JOIN "User" uploader ON uploader."id" = doc."uploadedById"
    WHERE ${Prisma.join(conditions, " AND ")}
  `;
}

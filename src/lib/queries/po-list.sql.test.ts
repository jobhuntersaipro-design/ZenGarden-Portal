import { describe, expect, it } from "vitest";
import {
  poListQuery,
  poListSummaryQuery,
  poReviewQueueQuery,
  poReviewQueueSummaryQuery,
} from "@/lib/queries/po-list.sql";

/**
 * This file exists for one line.
 *
 * `PurchaseOrder.documentId` became nullable in Phase 16, and the joins to
 * `Document` and to the uploading `User` were INNER. Left that way, every
 * order placed on the shop disappears from this list, from its money summary,
 * from the needs-review count and from the buyer page — with no error, no log
 * and **no type failure**, because the generated Prisma client types the
 * relation as non-null regardless. The first symptom is ops saying "I
 * confirmed it and it's gone."
 *
 * Nothing else in the suite would catch it, so the generated SQL is asserted
 * directly.
 */
const sqlOf = (query: { strings?: readonly string[]; sql?: string }) =>
  // Prisma.Sql exposes the assembled text as `sql`; `strings` is the raw
  // template, and either is enough to assert a join on.
  (query.sql ?? (query.strings ?? []).join("?")).replace(/\s+/g, " ");

const ALL = { status: "all" as const };

describe("the purchase-order list joins Document loosely", () => {
  // poListNeedsReviewQuery is deliberately absent: it forces
  // status "needs-review", which selects the draft branch alone, and a draft
  // always has a document — that join is correctly inner.
  it.each([
    ["poListQuery", () => poListQuery(ALL, { key: "poDate", dir: "desc" }, 0, 10)],
    ["poListSummaryQuery", () => poListSummaryQuery(ALL)],
  ])("%s uses LEFT JOIN, never an inner join, on Document", (_name, build) => {
    const text = sqlOf(build() as never);
    expect(text).toContain('LEFT JOIN "Document"');
    // An inner join would read `JOIN "Document"` with no LEFT before it.
    expect(text).not.toMatch(/(?<!LEFT )JOIN "Document" doc\s+ON doc\."id" = po\./);
  });

  it("does not lose the uploader join either — it is the same trap one table over", () => {
    const text = sqlOf(poListQuery(ALL, { key: "poDate", dir: "desc" }, 0, 10) as never);
    expect(text).toContain('LEFT JOIN "User" uploader');
  });

  it("labels a document-less row rather than leaving fileType null", () => {
    const text = sqlOf(poListQuery(ALL, { key: "poDate", dir: "desc" }, 0, 10) as never);
    expect(text).toContain("COALESCE(doc.\"mimeType\", 'web')");
  });

  /**
   * Every branch must emit `source`, and not only because a UNION needs the
   * same shape: since Phase 37 a confirmed shop order has a Document whose
   * uploader is the buyer's own contact, so "from the shop" can no longer be
   * inferred from a null uploader. Without this column the list prints a
   * customer's name in the Uploaded by cell.
   */
  it("says where every row came from, in every branch", () => {
    const text = sqlOf(poListQuery(ALL, { key: "poDate", dir: "desc" }, 0, 10) as never);
    // The table's two branches, and the queue's two (Phase 46).
    expect(text.match(/AS "source"/g)).toHaveLength(2);
    expect(sqlOf(poReviewQueueQuery() as never).match(/AS "source"/g)).toHaveLength(2);
    // The purchase-order branch asks the database rather than guessing.
    expect(text).toContain('SELECT 1 FROM "WebOrder" wo2 WHERE wo2."purchaseOrderId" = po."id"');
  });
});

describe("the expected delivery column", () => {
  // A UNION matches columns by position, so a branch missing it — or carrying
  // it in another place — either fails or shifts every column after it.
  it("is selected right after the PO date in every branch", () => {
    const table = sqlOf(poListQuery(ALL, { key: "poDate", dir: "desc" }, 0, 10) as never);
    const queue = sqlOf(poReviewQueueQuery() as never);
    const pairs = /AS "poDate", [^,]+ AS "deliveryDate"/g;
    expect(table.match(pairs)).toHaveLength(2);
    expect(queue.match(pairs)).toHaveLength(2);
    expect(table).toContain('po."deliveryDate" AS "deliveryDate"');
  });

  it("sorts on the column with the undated rows last", () => {
    const sql = sqlOf(poListQuery(ALL, { key: "deliveryDate", dir: "asc" }, 0, 10) as never);
    expect(sql).toContain('ORDER BY merged."deliveryDate" ASC NULLS LAST');
  });
});

/**
 * The branch is identified by the literal it selects, not by the table it
 * reads. `FROM "WebOrder"` stopped distinguishing it in Phase 37: the
 * purchase-order branch reads that table too, in the `EXISTS` subquery that
 * fills `source`.
 */
const SHOP_BRANCH = `'WEB' AS "kind"`;
const DRAFT_BRANCH = 'FROM "Extraction" ext';
const PO_BRANCH = 'FROM "PurchaseOrder" po';

/**
 * Phase 46: everything waiting on the team left the table for the review
 * queue above it, so each order appears once — in the queue until someone
 * confirms it, in the table after.
 */
describe("the main table", () => {
  const build = (status: Parameters<typeof poListQuery>[0]["status"]) =>
    sqlOf(poListQuery({ status }, { key: "poDate", dir: "desc" }, 0, 10) as never);

  it.each(["all", "confirmed", "extracting", "failed", "web"] as const)(
    "never holds an unconfirmed shop order, whatever the chip (%s)",
    (status) => {
      expect(build(status)).not.toContain(SHOP_BRANCH);
    },
  );

  it("keeps uploads still extracting or failed, but not one ready for review", () => {
    const all = build("all");
    expect(all).toContain(DRAFT_BRANCH);
    // Anchored on the WHERE, not a bare 'SUCCEEDED': the branch's own status
    // CASE names every state whatever the filter admits.
    expect(all).toContain(`ext."status"::text IN ('RUNNING', 'PENDING', 'FAILED')`);
    expect(all).not.toContain(`ext."status"::text IN ('SUCCEEDED'`);
    expect(build("extracting")).toContain(`ext."status"::text IN ('RUNNING', 'PENDING')`);
    expect(build("failed")).toContain(`ext."status"::text IN ('FAILED')`);
  });

  it("includes the purchase-order branch for confirmed, and only that", () => {
    const text = build("confirmed");
    expect(text).toContain(PO_BRANCH);
    expect(text).not.toContain(DRAFT_BRANCH);
  });

  it("the shop chip means confirmed shop orders only now", () => {
    // Anchored on the exact EXISTS that restricts orderRows to shop orders —
    // the Source CASE's own EXISTS uses the alias wo2, not w.
    const restriction =
      'EXISTS (SELECT 1 FROM "WebOrder" w WHERE w."purchaseOrderId" = po."id")';
    const web = build("web");
    expect(web).toContain(PO_BRANCH);
    expect(web).toContain(restriction);
    expect(web).not.toContain(DRAFT_BRANCH);
    expect(build("all")).not.toContain(restriction);
    expect(build("confirmed")).not.toContain(restriction);
  });

  it("sorts on source without leaving the allow-list", () => {
    const sql = sqlOf(poListQuery(ALL, { key: "source", dir: "asc" }, 0, 10) as never);
    expect(sql).toContain('merged."source"');
  });
});

describe("the review queue", () => {
  const queue = sqlOf(poReviewQueueQuery() as never);

  it("is every shop order sent or received, and every upload ready for review", () => {
    expect(queue).toContain(SHOP_BRANCH);
    expect(queue).toContain("WHERE wo.\"status\" IN ('SUBMITTED', 'RECEIVED')");
    expect(queue).toContain(DRAFT_BRANCH);
    // Exactly SUCCEEDED: nothing still extracting or failed. And the shop
    // WHERE above is exact, so a DRAFT — a client's live cart — never enters.
    expect(queue).toContain(`ext."status"::text IN ('SUCCEEDED')`);
    expect(queue).not.toContain(PO_BRANCH);
  });

  it("labels a received order apart from one still waiting to be received", () => {
    // The whole CASE, not its parts: the WHERE clause already supplies
    // 'SUBMITTED', 'RECEIVED' and wo."status", so the parts alone would pass
    // with the column reverted to a flat 'NEEDS_REVIEW'.
    expect(queue).toContain(
      'CASE WHEN wo."status" = \'RECEIVED\' THEN \'RECEIVED\' ELSE \'NEEDS_REVIEW\' END AS "status"',
    );
  });

  it("runs longest waiting first", () => {
    expect(queue).toContain('ORDER BY merged."queuedAt" ASC NULLS LAST, merged."poNumber" ASC');
    // When each kind joined the queue: a shop order's send, an upload's arrival.
    expect(queue).toContain('wo."submittedAt" AS "queuedAt"');
    expect(queue).toContain('doc."uploadedAt" AS "queuedAt"');
  });

  it("is counted over exactly the rows it shows — the sidebar's number", () => {
    const summary = sqlOf(poReviewQueueSummaryQuery() as never);
    const inner = (text: string) =>
      text.slice(text.indexOf("FROM (") + 6, text.lastIndexOf(") AS merged"));
    expect(summary).toContain('COUNT(*)::int AS "count"');
    // The same inner selection, character for character.
    expect(inner(summary)).toBe(inner(queue));
  });

  it("takes no filters: a search on the page must not hide someone's order", () => {
    expect(poReviewQueueQuery.length).toBe(0);
    expect(queue).not.toContain("ILIKE");
  });
});

/**
 * An unconfirmed row — a scan draft, a submitted or received shop order — has
 * no PO date, and Postgres puts NULLs last on the default newest-first sort. A
 * shop order sent this morning therefore sat on the list's last page, behind
 * every confirmed order ever filed. Sorting by PO date now puts the backlog
 * first in both directions, and the date orders what follows.
 */
describe("the backlog on a PO date sort", () => {
  it.each(["desc", "asc"] as const)("comes first when sorted %s", (dir) => {
    const sql = sqlOf(poListQuery(ALL, { key: "poDate", dir }, 0, 10) as never);
    expect(sql).toContain(
      `ORDER BY merged."sortStatus" ASC, merged."poDate" ${dir.toUpperCase()} NULLS LAST`,
    );
  });

  it("is not pinned on any other sort, which keeps its own meaning", () => {
    const sql = sqlOf(poListQuery(ALL, { key: "total", dir: "desc" }, 0, 10) as never);
    expect(sql).toContain('ORDER BY merged."total" DESC NULLS LAST');
  });
});

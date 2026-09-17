import { describe, expect, it } from "vitest";
import { poListQuery, poListSummaryQuery } from "@/lib/queries/po-list.sql";

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
  it("says where every row came from, in all three branches", () => {
    const text = sqlOf(poListQuery(ALL, { key: "poDate", dir: "desc" }, 0, 10) as never);
    expect(text.match(/AS "source"/g)).toHaveLength(3);
    // The purchase-order branch asks the database rather than guessing.
    expect(text).toContain('SELECT 1 FROM "WebOrder" wo2 WHERE wo2."purchaseOrderId" = po."id"');
  });
});

describe("the branches a filter selects", () => {
  it("includes the purchase-order branch for confirmed", () => {
    const text = sqlOf(poListQuery({ status: "confirmed" }, { key: "poDate", dir: "desc" }, 0, 10) as never);
    expect(text).toContain('FROM "PurchaseOrder" po');
  });

  it("includes the draft branch for needs-review", () => {
    const text = sqlOf(poListQuery({ status: "needs-review" }, { key: "poDate", dir: "desc" }, 0, 10) as never);
    expect(text).toContain('FROM "Extraction" ext');
  });
});

describe("the shop branch", () => {
  const build = (status: Parameters<typeof poListQuery>[0]["status"]) =>
    sqlOf(poListQuery({ status }, { key: "poDate", dir: "desc" }, 0, 10) as never);

  /**
   * The branch is identified by the literal it selects, not by the table it
   * reads. `FROM "WebOrder"` stopped distinguishing it in Phase 37: the
   * purchase-order branch now reads that table too, in the `EXISTS` subquery
   * that fills `source`. Asserting on the substring would have let a missing
   * branch pass as present, and did fail here on the opposite case.
   */
  const SHOP_BRANCH = `'WEB' AS "kind"`;

  // Phase 41 (order receipt): the shop chip now takes SUBMITTED and RECEIVED
  // both — "web" means "came from the shop", and receiving is a status within
  // that, not a departure from it. A DRAFT (a client's live cart) is still
  // never included.
  it("selects SUBMITTED and RECEIVED orders, never a DRAFT — a client's live cart", () => {
    const text = build("web");
    expect(text).toContain("wo.\"status\" IN ('SUBMITTED', 'RECEIVED')");
    expect(text).not.toContain("'DRAFT'");
  });

  it("is included by needs-review, so the chip's count and its rows agree", () => {
    expect(build("needs-review")).toContain(SHOP_BRANCH);
  });

  it("is included by all", () => {
    expect(build("all")).toContain(SHOP_BRANCH);
  });

  // Phase 41: the shop chip is no longer the WebOrder branch alone — a
  // confirmed shop order lives in PurchaseOrder, and "web" has to reach it
  // there too so a confirmed order still counts as "from the shop". Only the
  // draft branch (a document still in extraction) stays excluded.
  it("excludes the draft branch when the shop chip is chosen, but reaches both PurchaseOrder and WebOrder", () => {
    const text = build("web");
    expect(text).toContain(SHOP_BRANCH);
    expect(text).not.toContain('FROM "Extraction" ext');
    expect(text).toContain('FROM "PurchaseOrder" po');
  });

  it("is excluded by confirmed, which is a sales record", () => {
    expect(build("confirmed")).not.toContain(SHOP_BRANCH);
  });
});

describe("the received state", () => {
  it("brings received orders into the list and labels them", () => {
    const sql = sqlOf(poListQuery(ALL, { key: "poDate", dir: "desc" }, 0, 10) as never);
    expect(sql).toContain("'SUBMITTED'");
    expect(sql).toContain("'RECEIVED'");
    // The row must say which it is, or the badge cannot differ. Asserted as
    // the whole CASE, not just the substrings above: 'SUBMITTED' and
    // 'RECEIVED' and wo."status" are all already supplied by the WHERE
    // clause (wo."status" IN ('SUBMITTED', 'RECEIVED')), so those alone would
    // still pass if the status column were reverted to a flat
    // 'NEEDS_REVIEW' — the label every received row must actually carry.
    expect(sql).toContain(
      'CASE WHEN wo."status" = \'RECEIVED\' THEN \'RECEIVED\' ELSE \'NEEDS_REVIEW\' END AS "status"',
    );
  });

  it("partitions the shop backlog across the two chips", () => {
    const needsReview = sqlOf(
      poListQuery({ status: "needs-review" }, { key: "poDate", dir: "desc" }, 0, 10) as never,
    );
    const received = sqlOf(
      poListQuery({ status: "received" }, { key: "poDate", dir: "desc" }, 0, 10) as never,
    );
    // If both counted the same rows, receiving would tell the team nothing.
    // Asserted precisely, anchored on WHERE rather than a bare 'RECEIVED'
    // substring: R2's status CASE — `CASE WHEN wo."status" = 'RECEIVED' THEN
    // 'RECEIVED' ELSE 'NEEDS_REVIEW' END` — is present in `webOrderRows` for
    // *every* filter that includes that branch, including needs-review, and
    // its WHEN arm already contains the literal text `wo."status" =
    // 'RECEIVED'`. A bare substring check would fail on the CASE rather than
    // on the partition. What actually has to differ between the two chips is
    // which rows the WHERE clause admits, so the assertions are anchored on
    // "WHERE wo.\"status\" = ..." — a pattern the CASE's WHEN arm never
    // produces, since it always reads "WHEN", never "WHERE", before it.
    expect(needsReview).toContain('WHERE wo."status" = \'SUBMITTED\'');
    expect(needsReview).not.toContain('WHERE wo."status" = \'RECEIVED\'');
    expect(needsReview).not.toContain("WHERE wo.\"status\" IN ('SUBMITTED', 'RECEIVED')");
    expect(received).toContain('WHERE wo."status" = \'RECEIVED\'');
    // "received" must not pull in the draft branch — a draft has no shop
    // order to receive.
    expect(received).not.toContain('"Extraction"');
  });

  it("the shop chip means every shop-sourced row, confirmed ones included", () => {
    // Not just "PurchaseOrder" and "WebOrder" appearing somewhere in the
    // text: "WebOrder" is always present (the web branch itself, plus the
    // wo2 subquery inside the Source CASE every branch carries), and
    // "PurchaseOrder" also shows up in orderRows' own NOT EXISTS ... newer
    // revision check. What actually has to be true for "web" is that
    // orderRows is restricted to orders that came from the shop — asserted
    // by the exact EXISTS condition that does that restricting, present only
    // for "web" and absent for "all" and "confirmed" (checked not to collide
    // with the Source CASE's own EXISTS, which uses the alias wo2, not w).
    const restriction =
      'EXISTS (SELECT 1 FROM "WebOrder" w WHERE w."purchaseOrderId" = po."id")';
    const web = sqlOf(
      poListQuery({ status: "web" }, { key: "poDate", dir: "desc" }, 0, 10) as never,
    );
    expect(web).toContain('"PurchaseOrder"');
    expect(web).toContain('"WebOrder"');
    expect(web).toContain(restriction);

    const all = sqlOf(poListQuery(ALL, { key: "poDate", dir: "desc" }, 0, 10) as never);
    expect(all).not.toContain(restriction);

    const confirmed = sqlOf(
      poListQuery({ status: "confirmed" }, { key: "poDate", dir: "desc" }, 0, 10) as never,
    );
    expect(confirmed).not.toContain(restriction);
  });

  /**
   * The dashboard's "orders from the shop to confirm" line counts web orders
   * in SUBMITTED or RECEIVED and nothing else (`openWebOrderCount`). Since
   * `web` widened to every confirmed shop purchase order, that line cannot
   * link to it: "1 order to confirm" would land on that order plus every shop
   * order ever confirmed. `shop-open` is the filter it links to instead — the
   * web branch alone, so the number and the table under it agree
   * (00-master.md §4).
   */
  it("shop-open is exactly the unconfirmed shop orders the dashboard counts", () => {
    const text = sqlOf(
      poListQuery({ status: "shop-open" }, { key: "poDate", dir: "desc" }, 0, 10) as never,
    );
    expect(text).toContain(`'WEB' AS "kind"`);
    expect(text).toContain("WHERE wo.\"status\" IN ('SUBMITTED', 'RECEIVED')");
    // No scan drafts — the dashboard counts those on their own line.
    expect(text).not.toContain('"Extraction"');
    // No purchase orders — a confirmed shop order is nothing left to confirm.
    expect(text).not.toContain('FROM "PurchaseOrder" po');
    expect(text).not.toContain(`'PO' AS "kind"`);
  });

  it("shop-open counts the same rows its summary does", () => {
    const text = sqlOf(poListSummaryQuery({ status: "shop-open" }) as never);
    expect(text).toContain("WHERE wo.\"status\" IN ('SUBMITTED', 'RECEIVED')");
    expect(text).not.toContain('"Extraction"');
    expect(text).not.toContain('FROM "PurchaseOrder" po');
  });

  it("sorts on source without leaving the allow-list", () => {
    const sql = sqlOf(poListQuery(ALL, { key: "source", dir: "asc" }, 0, 10) as never);
    expect(sql).toContain('merged."source"');
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

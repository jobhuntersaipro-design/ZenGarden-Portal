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

  it("only ever selects SUBMITTED orders — a DRAFT is a client's live cart", () => {
    const text = build("web");
    expect(text).toContain("wo.\"status\" = 'SUBMITTED'");
    expect(text).not.toContain("'DRAFT'");
  });

  it("is included by needs-review, so the chip's count and its rows agree", () => {
    expect(build("needs-review")).toContain('FROM "WebOrder" wo');
  });

  it("is included by all", () => {
    expect(build("all")).toContain('FROM "WebOrder" wo');
  });

  it("is the only branch when the shop chip is chosen", () => {
    const text = build("web");
    expect(text).toContain('FROM "WebOrder" wo');
    expect(text).not.toContain('FROM "Extraction" ext');
    expect(text).not.toContain('FROM "PurchaseOrder" po');
  });

  it("is excluded by confirmed, which is a sales record", () => {
    expect(build("confirmed")).not.toContain('FROM "WebOrder" wo');
  });
});

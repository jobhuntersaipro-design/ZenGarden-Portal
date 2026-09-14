import { describe, expect, it } from "vitest";
import {
  auditText,
  mergeActivity,
  readDetail,
  type ActivityEntry,
} from "@/lib/queries/buyer-activity-entries";

const entry = (over: Partial<ActivityEntry>): ActivityEntry => ({
  id: "audit:1",
  kind: "change",
  at: "2026-09-12T02:00:00.000Z",
  text: "Chris Lam edited phone",
  actor: { name: "Chris Lam", image: null },
  href: null,
  ...over,
});

describe("readDetail", () => {
  it("reads a name and a field list out of a Json column", () => {
    expect(readDetail({ name: "Siti", fields: ["phone", "remark"] })).toEqual({
      name: "Siti",
      fields: ["phone", "remark"],
    });
  });

  // The column is Json: anything could be in it, including from a row written
  // by an older version of this code. It must never throw at render time.
  it("survives every shape that is not the one it wants", () => {
    expect(readDetail(null)).toEqual({ name: null, fields: [] });
    expect(readDetail("nonsense")).toEqual({ name: null, fields: [] });
    expect(readDetail({ fields: "phone" })).toEqual({ name: null, fields: [] });
    expect(readDetail({ name: 42, fields: [1, "phone"] })).toEqual({
      name: null,
      fields: ["phone"],
    });
  });
});

describe("auditText", () => {
  const base = { actorName: "Chris Lam", subjectName: "Siti", detail: null as unknown };

  it("names the actor and the contact for each contact action", () => {
    expect(auditText({ ...base, action: "PASSWORD_RESET" })).toBe(
      "Chris Lam reset Siti's password",
    );
    expect(auditText({ ...base, action: "CONTACT_DISABLED" })).toBe(
      "Chris Lam disabled Siti's access",
    );
    expect(auditText({ ...base, action: "CONTACT_RESTORED" })).toBe(
      "Chris Lam restored Siti's access",
    );
    expect(auditText({ ...base, action: "INVITE_RESENT" })).toBe(
      "Chris Lam resent Siti's invitation",
    );
    expect(auditText({ ...base, action: "CONTACT_INVITED" })).toBe("Chris Lam invited Siti");
    expect(auditText({ ...base, action: "RESET_LINK_SENT" })).toBe(
      "Chris Lam sent Siti a password-reset link",
    );
  });

  it("reads plainly, with field names rather than column names", () => {
    expect(
      auditText({
        ...base,
        action: "CUSTOMER_UPDATED",
        detail: { fields: ["contactName", "paymentTerms"] },
      }),
    ).toBe("Chris Lam edited contact, payment terms");
  });

  it("says who signed in", () => {
    expect(auditText({ ...base, actorName: "Siti", action: "SIGNED_IN" })).toBe("Siti signed in");
  });

  // The contact's row is gone and subjectUserId was SET NULL with it, which is
  // exactly why removeBuyerContact stores the name in the detail.
  it("still names a removed contact, from the detail", () => {
    expect(
      auditText({
        ...base,
        action: "CONTACT_REMOVED",
        subjectName: null,
        detail: { name: "Siti", email: "siti@acme.com" },
      }),
    ).toBe("Chris Lam removed Siti");
  });

  it("does not print 'null' when the actor's row is gone", () => {
    expect(auditText({ ...base, actorName: null, action: "PASSWORD_RESET" })).toBe(
      "Someone reset Siti's password",
    );
  });

  it("says something sensible for an edit that recorded no fields", () => {
    expect(auditText({ ...base, action: "CUSTOMER_UPDATED", detail: {} })).toBe(
      "Chris Lam edited this buyer",
    );
  });

  it("says who created the customer", () => {
    expect(auditText({ ...base, action: "CUSTOMER_CREATED" })).toBe(
      "Chris Lam created this buyer",
    );
  });

  // The only branch that reads `name` from the detail rather than
  // `subjectName` — the buyer row is gone by the time this renders, so there
  // is no `subjectName` to read at all, only what deleteBuyer stored.
  it("names a deleted customer from the detail, not from subjectName", () => {
    expect(
      auditText({
        ...base,
        action: "CUSTOMER_DELETED",
        subjectName: null,
        detail: { name: "Acme Industrial Sdn Bhd", contacts: ["siti@acme.com"] },
      }),
    ).toBe("Chris Lam deleted Acme Industrial Sdn Bhd");
  });

  it("edits a contact's fields, naming them", () => {
    expect(
      auditText({
        ...base,
        action: "CONTACT_UPDATED",
        detail: { fields: ["email", "phone"] },
      }),
    ).toBe("Chris Lam edited Siti's email, phone");
  });

  it("edits a contact with no fields recorded", () => {
    expect(auditText({ ...base, action: "CONTACT_UPDATED", detail: {} })).toBe(
      "Chris Lam edited Siti",
    );
  });
});

describe("mergeActivity", () => {
  const lists = [
    [entry({ id: "a:1", at: "2026-09-12T02:00:00.000Z", kind: "change" })],
    [entry({ id: "w:1", at: "2026-09-13T02:00:00.000Z", kind: "shop-order" })],
    [
      entry({ id: "p:1", at: "2026-09-11T02:00:00.000Z", kind: "purchase-order" }),
      entry({ id: "s:1", at: "2026-09-14T02:00:00.000Z", kind: "sign-in" }),
    ],
  ];

  it("interleaves every source, newest first", () => {
    const { entries, total } = mergeActivity(lists, { kind: "all", page: 1, size: 20, total: 4 });
    expect(entries.map((e) => e.id)).toEqual(["s:1", "w:1", "a:1", "p:1"]);
    expect(total).toBe(4);
  });

  // `total` is the caller's own authoritative count — `mergeActivity` never
  // derives it — so this exercises the slice logic alone: the same 1 that
  // happens to equal how many "sign-in" entries the fixture holds is passed
  // in, not computed here.
  it("filters to one kind, and returns whatever total the caller supplied", () => {
    const { entries, total } = mergeActivity(lists, { kind: "sign-in", page: 1, size: 20, total: 1 });
    expect(entries.map((e) => e.id)).toEqual(["s:1"]);
    expect(total).toBe(1);
  });

  it("pages", () => {
    const { entries, total } = mergeActivity(lists, { kind: "all", page: 2, size: 2, total: 4 });
    expect(entries.map((e) => e.id)).toEqual(["a:1", "p:1"]);
    expect(total).toBe(4);
  });

  // A transaction writes its rows with one timestamp, so ties are normal and
  // an unstable order would reshuffle the page on every render.
  it("breaks a tie on id rather than leaving the order to chance", () => {
    const tied = [
      [entry({ id: "b", at: "2026-09-12T02:00:00.000Z" })],
      [entry({ id: "a", at: "2026-09-12T02:00:00.000Z" })],
    ];
    expect(
      mergeActivity(tied, { kind: "all", page: 1, size: 20, total: 2 }).entries.map((e) => e.id),
    ).toEqual(["a", "b"]);
  });

  // Each source is read with `take: page * ACTIVITY_PAGE_SIZE`, so the
  // truncated union's own length is never the real row count once a
  // customer has more history than one page's worth. `total` is required,
  // not defaulted from that length, precisely so a caller cannot forget to
  // supply the real one — `loadBuyerActivity` computes it from `count()`
  // queries; a customer with 200+ real entries must not be told "4".
  it("returns the total it was given, not the length of what it was handed", () => {
    const { entries, total } = mergeActivity(lists, {
      kind: "all",
      page: 1,
      size: 20,
      total: 200,
    });
    expect(entries.map((e) => e.id)).toEqual(["s:1", "w:1", "a:1", "p:1"]);
    expect(total).toBe(200);
  });
});

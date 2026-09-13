import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebOrderStatus } from "@/generated/prisma/enums";

const buyerFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { buyer: { findMany: buyerFindMany } },
}));

const {
  listCustomers,
  loginsLabel,
  selectCustomers,
} = await import("@/lib/queries/admin-customers");
type CustomerRow = Awaited<ReturnType<typeof listCustomers>>[number];

const row = (over: Partial<CustomerRow>): CustomerRow => ({
  id: "b1",
  name: "Acme Industrial Sdn Bhd",
  contactName: "Raj",
  email: "accounts@acme.com",
  contactNames: ["Siti"],
  contactEmails: ["siti@acme.com"],
  active: 1,
  invited: 0,
  disabled: 0,
  lastActiveAt: "2026-09-10T02:00:00.000Z",
  orders: 4,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("loginsLabel", () => {
  it("names each kind it has, and only those", () => {
    expect(loginsLabel({ active: 2, invited: 1, disabled: 0 })).toBe("2 active · 1 invited");
    expect(loginsLabel({ active: 0, invited: 0, disabled: 3 })).toBe("3 disabled");
  });

  it("says None rather than an empty string", () => {
    expect(loginsLabel({ active: 0, invited: 0, disabled: 0 })).toBe("None");
  });
});

describe("selectCustomers", () => {
  const rows = [
    row({ id: "b1", name: "Acme Industrial Sdn Bhd", orders: 4 }),
    row({
      id: "b2",
      name: "Kim's Mart",
      contactName: null,
      contactNames: [],
      contactEmails: [],
      active: 0,
      lastActiveAt: null,
      orders: 12,
    }),
    row({
      id: "b3",
      name: "Northwind Traders",
      contactName: "Wei",
      contactNames: ["Wei Ling"],
      contactEmails: ["wei@northwind.example"],
      orders: 0,
      lastActiveAt: "2026-09-12T02:00:00.000Z",
    }),
  ];
  const sort = { key: "name", dir: "asc" } as const;

  it("matches the company name, case-insensitively", () => {
    const found = selectCustomers(rows, { q: "kim", sort });
    expect(found.map((r) => r.id)).toEqual(["b2"]);
  });

  // A super admin looking for a customer usually has the person's email, not
  // the company's registered name.
  it("matches a contact's name or email", () => {
    expect(selectCustomers(rows, { q: "wei@northwind", sort }).map((r) => r.id)).toEqual(["b3"]);
    expect(selectCustomers(rows, { q: "siti", sort }).map((r) => r.id)).toEqual(["b1"]);
  });

  // Spec §2: search matches the company's own `email`, not only a contact's.
  // A super admin usually has the company's accounts address, not a person's.
  it("matches the company's own accounts email", () => {
    const withCompanyEmail = rows.map((r) =>
      r.id === "b2" ? { ...r, email: "accounts@kimsmart.example" } : r,
    );
    expect(
      selectCustomers(withCompanyEmail, { q: "accounts@kimsmart", sort }).map((r) => r.id),
    ).toEqual(["b2"]);
  });

  it("does not choke on a customer with no email on file", () => {
    const withoutEmail = rows.map((r) => (r.id === "b2" ? { ...r, email: null } : r));
    expect(selectCustomers(withoutEmail, { q: "kim", sort }).map((r) => r.id)).toEqual(["b2"]);
  });

  it("sorts by orders descending", () => {
    const sorted = selectCustomers(rows, { sort: { key: "orders", dir: "desc" } });
    expect(sorted.map((r) => r.id)).toEqual(["b2", "b1", "b3"]);
  });

  // "Never" has to sort as older than any real timestamp, not as 1970 in the
  // middle of the list or as NaN at an arbitrary end.
  it("sorts a customer who has never signed in to the bottom of Last active, descending", () => {
    const sorted = selectCustomers(rows, { sort: { key: "lastActiveAt", dir: "desc" } });
    expect(sorted.map((r) => r.id)).toEqual(["b3", "b1", "b2"]);
  });

  it("leaves the input array alone", () => {
    const before = rows.map((r) => r.id);
    selectCustomers(rows, { sort: { key: "orders", dir: "desc" } });
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

describe("listCustomers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    buyerFindMany.mockResolvedValue([]);
  });

  // A cart is a WebOrder: `openCart` (src/actions/cart.ts) creates one at the
  // schema default status DRAFT the moment a signed-in client adds their
  // first item, and the guest-cart merge on sign-in does the same. Left
  // unfiltered, the Orders column would print "1 order" for a customer who
  // only ever abandoned a cart — and it would disagree with `deleteBuyer`'s
  // own count, which already excludes DRAFT for the identical reason. This
  // test only sees the query Prisma was asked to run, not any row shape, so
  // it is the only thing in this file that can catch the filter going missing.
  it("excludes draft web orders from the Orders count", async () => {
    await listCustomers();

    expect(buyerFindMany).toHaveBeenCalledTimes(1);
    const call = buyerFindMany.mock.calls[0]?.[0];
    expect(call.select._count.select.webOrders).toEqual({
      where: { status: { not: WebOrderStatus.DRAFT } },
    });
  });

  // Every other test in this file works on hand-built `CustomerRow`s, so
  // none of them can see `listCustomers`'s own mapping from a Prisma buyer
  // row to that shape. This is the one test that does: it stands in for
  // Prisma's actual return shape — `Date` objects, not strings, the way the
  // real client hands them back — and checks the derivation end to end.
  it("maps buyer rows into CustomerRows", async () => {
    buyerFindMany.mockResolvedValue([
      {
        id: "b1",
        name: "Acme Industrial Sdn Bhd",
        contactName: "Raj",
        email: "accounts@acme.com",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        _count: { purchaseOrders: 3, webOrders: 2 },
        contacts: [
          {
            name: "Active One",
            email: "active@acme.com",
            disabledAt: null,
            mustChangePassword: false,
            lastActiveAt: new Date("2026-09-10T02:00:00.000Z"),
          },
          // Deliberately carries the LATEST lastActiveAt of the four, and
          // sits in the middle of the resulting `seen` array (index 1 of 3
          // once the null below is filtered out) — so "take the first" and
          // "take the last" both land on the wrong contact, and only an
          // actual maximum picks this one.
          {
            name: "Invited One",
            email: "invited@acme.com",
            disabledAt: null,
            mustChangePassword: true,
            lastActiveAt: new Date("2026-09-14T02:00:00.000Z"),
          },
          // Deliberately also carries mustChangePassword: true, so the test
          // exercises the precedence that a disabled contact counts as
          // disabled even while they still have a temporary password —
          // rather than leaving that branch order unexercised.
          {
            name: "Disabled One",
            email: "disabled@acme.com",
            disabledAt: new Date("2026-08-01T00:00:00.000Z"),
            mustChangePassword: true,
            lastActiveAt: new Date("2026-09-12T02:00:00.000Z"),
          },
          // A contact who has never signed in at all: their null must be
          // filtered out of `seen` rather than coerced into the comparison.
          {
            name: "Never Signed In",
            email: "never@acme.com",
            disabledAt: null,
            mustChangePassword: false,
            lastActiveAt: null,
          },
        ],
      },
      {
        id: "b2",
        name: "Kim's Mart",
        contactName: null,
        email: null,
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        _count: { purchaseOrders: 0, webOrders: 0 },
        contacts: [],
      },
    ]);

    const rows = await listCustomers();

    expect(rows).toEqual([
      {
        id: "b1",
        name: "Acme Industrial Sdn Bhd",
        contactName: "Raj",
        email: "accounts@acme.com",
        contactNames: ["Active One", "Invited One", "Disabled One", "Never Signed In"],
        contactEmails: [
          "active@acme.com",
          "invited@acme.com",
          "disabled@acme.com",
          "never@acme.com",
        ],
        active: 2,
        invited: 1,
        disabled: 1,
        // The maximum of the four (Invited One's), not Active One's (first)
        // and not Disabled One's (last before the null-signed-in contact).
        lastActiveAt: "2026-09-14T02:00:00.000Z",
        orders: 5,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "b2",
        name: "Kim's Mart",
        contactName: null,
        email: null,
        contactNames: [],
        contactEmails: [],
        active: 0,
        invited: 0,
        disabled: 0,
        // The seen.length > 0 guard: no contact at all, not even one who
        // has never signed in, so this must be null rather than an empty
        // Math.max blowing up into -Infinity or NaN.
        lastActiveAt: null,
        orders: 0,
        createdAt: "2026-02-01T00:00:00.000Z",
      },
    ]);
  });
});

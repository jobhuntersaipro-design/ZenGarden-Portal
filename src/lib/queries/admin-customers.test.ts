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
});

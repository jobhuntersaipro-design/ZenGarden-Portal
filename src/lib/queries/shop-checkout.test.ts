import { beforeEach, describe, expect, it, vi } from "vitest";

const buyerFindUnique = vi.fn();
const webOrderFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    buyer: { findUnique: buyerFindUnique },
    webOrder: { findFirst: webOrderFindFirst },
  },
}));

const { loadReviewBuyer, loadSentOrder } = await import("@/lib/queries/shop-checkout");
const { Prisma } = await import("@/generated/prisma/client");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("loadReviewBuyer", () => {
  it("asks for the four fields the screen prints and nothing else", async () => {
    buyerFindUnique.mockResolvedValue({
      name: "Acme Industrial Sdn Bhd",
      address: "1 Jalan Satu",
      contactName: "Aisha",
      email: "aisha@acme.test",
    });

    await loadReviewBuyer("b1");

    // An equality, not a subset: `Buyer.remark` is the ops team's private
    // note, and this is a screen a customer reads. Widening it has to be a
    // deliberate edit to this line.
    expect(buyerFindUnique.mock.calls[0][0].select).toEqual({
      name: true,
      address: true,
      contactName: true,
      email: true,
    });
  });

  it("returns null when the buyer has gone", async () => {
    buyerFindUnique.mockResolvedValue(null);
    expect(await loadReviewBuyer("b1")).toBeNull();
  });
});

describe("loadSentOrder", () => {
  const order = {
    id: "w1",
    reference: "W-2609-00007",
    buyerReference: "ACME-771",
    subtotal: new Prisma.Decimal("1926.50"),
    submittedAt: new Date("2026-09-14T02:00:00.000Z"),
    placedBy: { email: "aisha@acme.test" },
  };

  it("scopes the lookup to the caller's own buyer and to a sent order", async () => {
    webOrderFindFirst.mockResolvedValue(order);

    await loadSentOrder("b1", "W-2609-00007");

    expect(webOrderFindFirst.mock.calls[0][0].where).toEqual({
      reference: "W-2609-00007",
      buyerId: "b1",
      status: { in: ["SUBMITTED", "CONFIRMED"] },
    });
  });

  it("never selects the ops trail a customer must not read", async () => {
    webOrderFindFirst.mockResolvedValue(order);
    await loadSentOrder("b1", "W-2609-00007");

    const select = webOrderFindFirst.mock.calls[0][0].select;
    expect(select).toEqual({
      id: true,
      reference: true,
      buyerReference: true,
      subtotal: true,
      submittedAt: true,
      placedBy: { select: { email: true } },
    });
  });

  it("returns the order with its total as a fixed string", async () => {
    webOrderFindFirst.mockResolvedValue(order);

    expect(await loadSentOrder("b1", "W-2609-00007")).toEqual({
      id: "w1",
      reference: "W-2609-00007",
      buyerReference: "ACME-771",
      total: "1926.50",
      placedByEmail: "aisha@acme.test",
      submittedAt: order.submittedAt,
    });
  });

  it("returns null for another company's reference", async () => {
    webOrderFindFirst.mockResolvedValue(null);
    expect(await loadSentOrder("b1", "W-2609-00099")).toBeNull();
  });
});

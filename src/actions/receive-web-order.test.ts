import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const webUpdateMany = vi.fn();
const webFindUnique = vi.fn();
const requireUser = vi.fn();
const writePurchaseOrder = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webOrder: { updateMany: webUpdateMany, findUnique: webFindUnique },
  },
}));
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireUser,
}));
// receiveWebOrder never calls this, but src/actions/web-orders.ts imports it
// at module scope, the same as its sibling confirm-web-order.test.ts mocks.
vi.mock("@/actions/purchase-orders", () => ({ writePurchaseOrder }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://www.example.com", SHOP_URL: "https://shop.example.com" },
}));
const sendEmail = vi.fn().mockResolvedValue({ sent: true });
vi.mock("@/lib/email", () => ({ sendEmail }));
const afterTasks: Promise<unknown>[] = [];
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    afterTasks.push(Promise.resolve(fn()));
  },
}));
const flushAfter = async () => {
  await Promise.all(afterTasks);
  afterTasks.length = 0;
};
// module-scope import in web-orders.ts, the same as confirm-web-order.test.ts
const attachWebOrderDocument = vi.fn();
vi.mock("@/lib/web-order-document", () => ({ attachWebOrderDocument }));

const { receiveWebOrder } = await import("@/actions/web-orders");

beforeEach(() => {
  vi.clearAllMocks();
  afterTasks.length = 0;
  requireUser.mockResolvedValue({ id: "u1", name: "Aisha Rahman" });
  webUpdateMany.mockResolvedValue({ count: 1 });
  webFindUnique.mockResolvedValue({
    reference: "W-2609-00001",
    buyerReference: "ACME-PO-771",
    subtotal: { toNumber: () => 1926.5 },
    placedBy: { email: "buyer@example.com" },
    _count: { lines: 3 },
  });
});

describe("receiveWebOrder", () => {
  it("moves a submitted order to RECEIVED and records who and when", async () => {
    const result = await receiveWebOrder("w1");

    expect(result).toEqual({ success: true, data: undefined });
    const call = webUpdateMany.mock.calls[0]![0];
    // Guarded on the status the caller last saw: two people receiving at once
    // cannot both win.
    expect(call.where).toEqual({ id: "w1", status: "SUBMITTED" });
    expect(call.data.status).toBe("RECEIVED");
    expect(call.data.receivedById).toBe("u1");
    expect(call.data.receivedAt).toBeInstanceOf(Date);
  });

  it("refuses an order somebody else already received, and writes nothing else", async () => {
    webUpdateMany.mockResolvedValue({ count: 0 });
    const result = await receiveWebOrder("w1");

    expect(result).toEqual({
      success: false,
      error: "This one has already been received.",
    });
    await flushAfter();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails the buyer, on the shop host", async () => {
    await receiveWebOrder("w1");
    await flushAfter();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0]![0];
    expect(mail.to).toEqual(["buyer@example.com"]);
    expect(mail.subject).toBe("We have your order W-2609-00001");
    // Phase 15: the buyer's session exists on the shop host only.
    expect(renderToStaticMarkup(mail.react)).toContain(
      "https://shop.example.com/orders/w1",
    );
  });

  // src/lib/email.ts is documented "never throws" and returns { sent: false }
  // on failure. A missing nudge is not a failed acknowledgement.
  it("still succeeds when the email does not go", async () => {
    sendEmail.mockResolvedValue({ sent: false });
    const result = await receiveWebOrder("w1");
    await flushAfter();
    expect(result.success).toBe(true);
  });

  it("refuses a caller who is not ops staff", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireUser.mockRejectedValue(new UnauthorizedError("not signed in"));
    expect(await receiveWebOrder("w1")).toEqual({
      success: false,
      error: "not signed in",
    });
    expect(webUpdateMany).not.toHaveBeenCalled();
  });

  it("revalidates the order's own page", async () => {
    const { revalidatePath } = await import("next/cache");
    await receiveWebOrder("w1");

    expect(revalidatePath).toHaveBeenCalledWith("/web-orders/w1");
  });
});

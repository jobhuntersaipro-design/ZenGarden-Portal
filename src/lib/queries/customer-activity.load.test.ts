import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebOrderStatus } from "@/generated/prisma/enums";

const auditFindMany = vi.fn();
const webOrderFindMany = vi.fn();
const purchaseOrderFindMany = vi.fn();
const poStageEventFindMany = vi.fn();
const userFindMany = vi.fn();
const loginAttemptFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditEvent: { findMany: auditFindMany },
    webOrder: { findMany: webOrderFindMany },
    purchaseOrder: { findMany: purchaseOrderFindMany },
    poStageEvent: { findMany: poStageEventFindMany },
    user: { findMany: userFindMany },
    loginAttempt: { findMany: loginAttemptFindMany },
  },
}));

const { loadCustomerActivity } = await import("@/lib/queries/customer-activity");

beforeEach(() => {
  vi.resetAllMocks();
  auditFindMany.mockResolvedValue([]);
  webOrderFindMany.mockResolvedValue([]);
  purchaseOrderFindMany.mockResolvedValue([]);
  poStageEventFindMany.mockResolvedValue([]);
  userFindMany.mockResolvedValue([]);
  loginAttemptFindMany.mockResolvedValue([]);
});

// A cart IS a WebOrder: `openCart` (src/actions/cart.ts) creates one at the
// schema default status DRAFT the moment a signed-in client adds their first
// item. Left unfiltered, the timeline would print "placed an order" for
// everyone who ever abandoned a cart. This test only sees the query Prisma
// was asked to run, not any row shape, so it is the only thing that can
// catch the exclusion going missing.
describe("loadCustomerActivity never surfaces a draft web order", () => {
  it("excludes DRAFT from the WebOrder query", async () => {
    await loadCustomerActivity("b1", { page: 1, kind: "all" });

    expect(webOrderFindMany).toHaveBeenCalledTimes(1);
    const call = webOrderFindMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({ buyerId: "b1", status: { not: WebOrderStatus.DRAFT } });
  });
});

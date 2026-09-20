import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const poFindUnique = vi.fn();
const poUpdateMany = vi.fn();
const eventCreate = vi.fn();

const tx = {
  purchaseOrder: { updateMany: poUpdateMany },
  poStageEvent: { create: eventCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchaseOrder: { findUnique: poFindUnique },
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
  },
}));

class UnauthorizedErrorStub extends Error {}
const requireUser = vi.fn();
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: UnauthorizedErrorStub,
  requireUser: () => requireUser(),
}));

// Phase 48: the guards ask the permission grid, not the role.
const requirePermission = vi.fn();
const rolesWithPermission = vi.fn();
vi.mock("@/lib/permissions/require", () => ({
  requirePermission: (key: string, message?: string) =>
    requirePermission(key, message),
  rolesWithPermission: (key: string) => rolesWithPermission(key),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Phase 38: a delivery date that moves emails the buyer, so this module now
// reaches the env and the mailer. `after` is run inline and its promise kept,
// so a test asserting on an email cannot race the send.
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
// Phase 42: a moved date redraws the shop order's purchase-order file.
const attachWebOrderDocument = vi.fn();
const readStoredWebOrderDocument = vi.fn();
vi.mock("@/lib/web-order-document", () => ({
  attachWebOrderDocument,
  readStoredWebOrderDocument,
}));
// The email's document half (2026-09-18): the real attachment builder, with a
// stand-in preview so no test rasterises a PDF. `document` is null here — the
// facts and line table are covered by `po-email.test.tsx`.
vi.mock("@/lib/po-email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/po-email")>();
  return {
    ...actual,
    preparePoEmail: async (
      _webOrderId: string,
      reference: string,
      file: { bytes: Uint8Array } | null,
    ) => ({
      document: null,
      preview: Boolean(file),
      attached: Boolean(file),
      attachments: file
        ? actual.poEmailAttachments({
            poNumber: reference,
            pdfBytes: file.bytes,
            previewPng: Buffer.from("png"),
          })
        : undefined,
    }),
  };
});

const { advanceStage, revertStage, updatePurchaseOrder } = await import(
  "@/actions/stages"
);

const member = {
  id: "user-1",
  email: "a@b.com",
  name: "Aisha Rahman",
  image: null,
  role: "MEMBER",
  mustChangePassword: false,
};
const admin = { ...member, id: "user-2", name: "Chris Lam", role: "SUPER_ADMIN" };

beforeEach(() => {
  vi.clearAllMocks();
  afterTasks.length = 0;
  sendEmail.mockResolvedValue({ sent: true });
  requireUser.mockResolvedValue(member);
  requirePermission.mockResolvedValue(member);
  rolesWithPermission.mockResolvedValue([]);
  poFindUnique.mockResolvedValue({ stage: "IN_PRODUCTION" });
  poUpdateMany.mockResolvedValue({ count: 1 });
  eventCreate.mockResolvedValue({});
});

describe("advanceStage", () => {
  it("moves one stage forward and records who did it", async () => {
    const result = await advanceStage("po-1", "Batch 1 started");
    expect(result).toEqual({ success: true, data: { stage: "QC_PASSED" } });
    const event = eventCreate.mock.calls[0][0].data;
    expect(event).toMatchObject({
      fromStage: "IN_PRODUCTION",
      toStage: "QC_PASSED",
      note: "Batch 1 started",
      changedById: "user-1",
      kind: "STAGE",
    });
  });

  it("guards the update on the stage the caller last saw", async () => {
    await advanceStage("po-1");
    // Without this `where`, two simultaneous clicks would advance twice.
    expect(poUpdateMany.mock.calls[0][0].where).toEqual({
      id: "po-1",
      stage: "IN_PRODUCTION",
    });
  });

  it("tells the loser of a race to refresh, and writes no event", async () => {
    poUpdateMany.mockResolvedValue({ count: 0 });
    const result = await advanceStage("po-1");
    expect(result).toEqual({
      success: false,
      error: "This order was already moved. Refresh.",
    });
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("refuses to advance past Delivered", async () => {
    poFindUnique.mockResolvedValue({ stage: "DELIVERED" });
    const result = await advanceStage("po-1");
    expect(result).toEqual({
      success: false,
      error: "This order is already delivered.",
    });
    expect(poUpdateMany).not.toHaveBeenCalled();
  });

  it("stores an empty note as null rather than an empty string", async () => {
    await advanceStage("po-1", "   ");
    expect(eventCreate.mock.calls[0][0].data.note).toBeNull();
  });

  // Phase 48. The key comes from the row, never from the caller.
  it("asks for the key of the stage it just read, not the one it moves to", async () => {
    poFindUnique.mockResolvedValue({ stage: "QC_PASSED" });
    const result = await advanceStage("po-1");
    expect(result).toEqual({ success: true, data: { stage: "IN_WAREHOUSE" } });
    expect(requirePermission).toHaveBeenCalledWith(
      "po.advance.qc_passed",
      expect.any(String),
    );
  });

  it.each([
    ["ORDER_PLACED", "po.advance.order_placed"],
    ["IN_PRODUCTION", "po.advance.in_production"],
    ["QC_PASSED", "po.advance.qc_passed"],
    ["IN_WAREHOUSE", "po.advance.in_warehouse"],
    ["DELIVERING", "po.advance.delivering"],
  ])("keys an advance out of %s on %s", async (stage, key) => {
    poFindUnique.mockResolvedValue({ stage });
    await advanceStage("po-1");
    expect(requirePermission).toHaveBeenCalledWith(key, expect.any(String));
  });

  it("refuses, and writes nothing, when the role does not own the stage", async () => {
    poFindUnique.mockResolvedValue({ stage: "QC_PASSED" });
    requirePermission.mockRejectedValue(
      new UnauthorizedErrorStub("Warehouse advances this stage."),
    );
    const result = await advanceStage("po-1");
    expect(result).toEqual({
      success: false,
      error: "Warehouse advances this stage.",
    });
    expect(poUpdateMany).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("names the role that does own the stage in the refusal", async () => {
    poFindUnique.mockResolvedValue({ stage: "QC_PASSED" });
    rolesWithPermission.mockResolvedValue(["SUPER_ADMIN", "WAREHOUSE"]);
    await advanceStage("po-1");
    expect(requirePermission).toHaveBeenCalledWith(
      "po.advance.qc_passed",
      "Warehouse advances this stage.",
    );
  });

  it("says a super admin owns it when nobody else does", async () => {
    poFindUnique.mockResolvedValue({ stage: "QC_PASSED" });
    rolesWithPermission.mockResolvedValue(["SUPER_ADMIN"]);
    await advanceStage("po-1");
    expect(requirePermission).toHaveBeenCalledWith(
      "po.advance.qc_passed",
      "Only a super admin advances this stage.",
    );
  });

  it("asks for no permission at all on a delivered order", async () => {
    poFindUnique.mockResolvedValue({ stage: "DELIVERED" });
    await advanceStage("po-1");
    expect(requirePermission).not.toHaveBeenCalled();
  });
});

describe("revertStage", () => {
  it("asks the grid for po.revert", async () => {
    requirePermission.mockResolvedValue(admin);
    await revertStage("po-1", "QC failed");
    expect(requirePermission.mock.calls[0][0]).toBe("po.revert");
  });

  it("refuses a role without it, even though the button is hidden from them", async () => {
    requirePermission.mockRejectedValue(
      new UnauthorizedErrorStub("Your role can't move an order back a stage."),
    );
    const result = await revertStage("po-1", "Wrong batch");
    expect(result).toEqual({
      success: false,
      error: "Your role can't move an order back a stage.",
    });
    expect(poUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses an empty note", async () => {
    requirePermission.mockResolvedValue(admin);
    const result = await revertStage("po-1", "   ");
    expect(result).toEqual({
      success: false,
      error: "A note is required when moving back.",
    });
    expect(poUpdateMany).not.toHaveBeenCalled();
  });

  it("moves back one stage for a super admin and names them in the event", async () => {
    requirePermission.mockResolvedValue(admin);
    const result = await revertStage("po-1", "QC failed on batch 2");
    expect(result).toEqual({ success: true, data: { stage: "ORDER_PLACED" } });
    expect(eventCreate.mock.calls[0][0].data).toMatchObject({
      fromStage: "IN_PRODUCTION",
      toStage: "ORDER_PLACED",
      note: "QC failed on batch 2",
      changedById: "user-2",
    });
  });

  it("refuses to move back from the first stage", async () => {
    requirePermission.mockResolvedValue(admin);
    poFindUnique.mockResolvedValue({ stage: "ORDER_PLACED" });
    const result = await revertStage("po-1", "Nope");
    expect(result).toEqual({
      success: false,
      error: "Order placed is the first stage.",
    });
  });

  it("applies the same race guard as advancing", async () => {
    requirePermission.mockResolvedValue(admin);
    poUpdateMany.mockResolvedValue({ count: 0 });
    const result = await revertStage("po-1", "QC failed");
    expect(result).toEqual({
      success: false,
      error: "This order was already moved. Refresh.",
    });
  });
});

describe("updatePurchaseOrder — the expected delivery date", () => {
  const existing = {
    stage: "ORDER_PLACED",
    poNumber: "W-2609-00001",
    poDate: new Date("2026-09-15T00:00:00.000Z"),
    deliveryDate: new Date("2026-10-02T00:00:00.000Z"),
    paymentTerms: "30 days",
    notes: null,
    total: { toNumber: () => 210 },
    currency: "MYR",
    webOrder: {
      id: "wo1",
      reference: "W-2609-00001",
      buyerReference: "ACME-PO-771",
      placedBy: { email: "buyer@acme.test" },
      _count: { lines: 1 },
    },
  };
  const patch = {
    poNumber: "W-2609-00001",
    poDate: "2026-09-15",
    deliveryDate: "2026-10-02",
    paymentTerms: "30 days",
    notes: null,
    // Every patch that moves the date carries one; the action refuses it
    // otherwise, which is its own test below.
    reason: "Buyer asked for another week.",
  };

  const transaction = vi.fn();

  /** The `poStageEvent.create` argument from the transaction's writes. */
  const eventWrite = () => {
    const create = vi.mocked(
      (globalThis as unknown as { __poEventCreate: ReturnType<typeof vi.fn> })
        .__poEventCreate,
    );
    return create.mock.calls.at(-1)![0].data as { note: string };
  };

  beforeEach(async () => {
    poFindUnique.mockResolvedValue(existing);
    const { prisma } = await import("@/lib/prisma");
    (prisma as unknown as { $transaction: unknown }).$transaction = transaction;
    transaction.mockResolvedValue([{}, {}]);
    (prisma as unknown as { purchaseOrder: Record<string, unknown> }).purchaseOrder.update =
      vi.fn();
    const create = vi.fn();
    (globalThis as unknown as { __poEventCreate: unknown }).__poEventCreate = create;
    (prisma as unknown as { poStageEvent: Record<string, unknown> }).poStageEvent = {
      create,
    };
  });

  // The confirm form's rule, on the edit sheet too (2026-09-17).
  it("refuses an expected delivery date before the PO date, and writes nothing", async () => {
    const result = await updatePurchaseOrder("po1", {
      ...patch,
      deliveryDate: "2026-09-14",
    });
    expect(result).toEqual({
      success: false,
      error: "Expected delivery can't be before the PO date.",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("refuses a PO date moved past the delivery date", async () => {
    const result = await updatePurchaseOrder("po1", { ...patch, poDate: "2026-10-03" });
    expect(result.success).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("still allows clearing the delivery date", async () => {
    const result = await updatePurchaseOrder("po1", { ...patch, deliveryDate: null });
    expect(result.success).toBe(true);
  });

  it("writes nothing and emails nobody when nothing moved", async () => {
    const result = await updatePurchaseOrder("po1", patch);
    await flushAfter();
    expect(result.success).toBe(true);
    expect(transaction).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  /**
   * A delivery date that moves without telling the buyer is exactly what they
   * would ring up about — so the same template goes out again, saying so.
   */
  it("tells the buyer when the date moves, in the subject as well as the body", async () => {
    await updatePurchaseOrder("po1", { ...patch, deliveryDate: "2026-10-09" });
    await flushAfter();

    const call = sendEmail.mock.calls[0][0];
    expect(call.to).toEqual(["buyer@acme.test"]);
    // Named by the buyer's own PO number since 2026-09-20.
    expect(call.subject).toBe(
      "Updated: order ACME-PO-771 · delivery now expected 9 Oct 2026",
    );
    const body = renderToStaticMarkup(call.react);
    expect(body).toContain("9 Oct 2026");
    expect(body).toContain("has moved");
  });

  it("redraws the purchase-order file and attaches it to the email", async () => {
    attachWebOrderDocument.mockResolvedValue({
      documentId: "doc1",
      filename: "W-2609-00001 purchase order.pdf",
      bytes: new Uint8Array([37, 80]),
    });
    await updatePurchaseOrder("po1", { ...patch, deliveryDate: "2026-10-09" });
    await flushAfter();

    expect(attachWebOrderDocument).toHaveBeenCalledExactlyOnceWith("wo1", {
      redraw: true,
    });
    const call = sendEmail.mock.calls[0][0];
    expect(call.attachments).toEqual([
      {
        filename: "W-2609-00001.pdf",
        content: expect.any(Buffer),
        contentType: "application/pdf",
      },
      {
        filename: "W-2609-00001-preview.png",
        content: expect.any(Buffer),
        contentType: "image/png",
        contentId: "po-preview",
      },
    ]);
    expect(renderToStaticMarkup(call.react)).toContain("is attached to");
  });

  it("names the change in the activity entry", async () => {
    await updatePurchaseOrder("po1", { ...patch, deliveryDate: "2026-10-09" });
    const writes = transaction.mock.calls[0][0];
    expect(writes).toHaveLength(2);
  });

  /**
   * The date the buyer is waiting on does not move unattributed, and the row
   * that records it has to answer what it moved *from* — which the field's
   * name alone never could.
   */
  it("refuses a moved delivery date with no reason, and writes nothing", async () => {
    const result = await updatePurchaseOrder("po1", {
      ...patch,
      deliveryDate: "2026-10-09",
      reason: "   ",
    });
    expect(result).toEqual({
      success: false,
      error: "Say why the expected delivery date is moving.",
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("records both dates and the reason on the activity entry", async () => {
    await updatePurchaseOrder("po1", {
      ...patch,
      deliveryDate: "2026-10-09",
      reason: "Buyer asked for another week.",
    });
    const { note } = eventWrite();
    expect(note).toBe(
      "Expected delivery 2 Oct 2026 → 9 Oct 2026\nBuyer asked for another week.",
    );
  });

  it("says so when a date is set for the first time, or cleared", async () => {
    poFindUnique.mockResolvedValue({ ...existing, deliveryDate: null });
    await updatePurchaseOrder("po1", { ...patch, deliveryDate: "2026-10-09" });
    expect(eventWrite().note).toContain("Expected delivery set to 9 Oct 2026");

    transaction.mockClear();
    poFindUnique.mockResolvedValue(existing);
    await updatePurchaseOrder("po1", { ...patch, deliveryDate: null });
    expect(eventWrite().note).toContain(
      "Expected delivery cleared (was 2 Oct 2026)",
    );
  });

  /** A reason is asked for only when the date moves, so it is not recorded. */
  it("keeps the old field list when the date did not move", async () => {
    await updatePurchaseOrder("po1", { ...patch, paymentTerms: "45 days" });
    expect(eventWrite().note).toBe("Edited: payment terms");
  });

  /**
   * An uploaded purchase order has no shop account behind it to write to, so
   * the same edit on one sends nothing at all.
   */
  it("emails nobody when the order did not come from the shop", async () => {
    poFindUnique.mockResolvedValue({ ...existing, webOrder: null });
    await updatePurchaseOrder("po1", { ...patch, deliveryDate: "2026-10-09" });
    await flushAfter();
    expect(transaction).toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(attachWebOrderDocument).not.toHaveBeenCalled();
  });

  it("emails nobody when the date is cleared rather than moved", async () => {
    // There is no date to promise, so there is nothing to tell them — but the
    // file still loses the date it printed.
    await updatePurchaseOrder("po1", { ...patch, deliveryDate: null });
    await flushAfter();
    expect(transaction).toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(attachWebOrderDocument).toHaveBeenCalledExactlyOnceWith("wo1", {
      redraw: true,
    });
  });
});

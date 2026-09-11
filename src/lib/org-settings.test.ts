import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { orgSettings: { findUnique } },
}));
vi.mock("@/lib/env", () => ({
  env: {
    SUPPLIER_NAME: "Env Name",
    SUPPLIER_EMAIL: "env@example.com",
    SUPPLIER_PHONE: "+60 3-0000 0000",
    SUPPLIER_ADDRESS: "Env address",
  },
}));

const { loadSupplierDetails, loadSupplierSettings } = await import("@/lib/org-settings");

beforeEach(() => {
  vi.resetAllMocks();
});

const row = (over: Record<string, unknown> = {}) => ({
  supplierName: null,
  supplierEmail: null,
  supplierPhone: null,
  supplierAddress: null,
  updatedAt: new Date("2026-09-11T00:00:00Z"),
  updatedBy: null,
  ...over,
});

describe("loadSupplierDetails resolves per field, not per row", () => {
  it("falls back to env for every field when there is no row at all", async () => {
    findUnique.mockResolvedValue(null);
    expect(await loadSupplierDetails()).toEqual({
      name: "Env Name",
      email: "env@example.com",
      phone: "+60 3-0000 0000",
      address: "Env address",
    });
  });

  it("takes a stored field and still falls back for the others", async () => {
    // The defect this whole test file exists for: resolving per row would
    // blank the phone that is still living in an env var.
    findUnique.mockResolvedValue(row({ supplierEmail: "stored@example.com" }));
    const details = await loadSupplierDetails();
    expect(details.email).toBe("stored@example.com");
    expect(details.phone).toBe("+60 3-0000 0000");
    expect(details.name).toBe("Env Name");
    expect(details.address).toBe("Env address");
  });

  it("prefers every stored field when all are set", async () => {
    findUnique.mockResolvedValue(
      row({
        supplierName: "Kim Brothers",
        supplierEmail: "no-reply@kim-brothers.com",
        supplierPhone: "+60 12-345 6789",
        supplierAddress: "12 Jalan Satu\nPuchong",
      }),
    );
    expect(await loadSupplierDetails()).toEqual({
      name: "Kim Brothers",
      email: "no-reply@kim-brothers.com",
      phone: "+60 12-345 6789",
      address: "12 Jalan Satu\nPuchong",
    });
  });

  it("reads the singleton by primary key", async () => {
    findUnique.mockResolvedValue(null);
    await loadSupplierDetails();
    expect(findUnique.mock.calls[0][0].where).toEqual({ id: "singleton" });
  });
});

describe("loadSupplierSettings", () => {
  it("reports stored and fallback separately, so the card can show both", async () => {
    findUnique.mockResolvedValue(row({ supplierEmail: "stored@example.com" }));
    const settings = await loadSupplierSettings();
    expect(settings.stored.email).toBe("stored@example.com");
    expect(settings.stored.phone).toBeNull();
    expect(settings.fallback.phone).toBe("+60 3-0000 0000");
  });

  it("names who saved it", async () => {
    findUnique.mockResolvedValue(row({ updatedBy: { name: "Aisha Rahman" } }));
    const settings = await loadSupplierSettings();
    expect(settings.updatedByName).toBe("Aisha Rahman");
    expect(settings.updatedAt).toEqual(new Date("2026-09-11T00:00:00Z"));
  });

  it("has no updatedAt before the first save", async () => {
    findUnique.mockResolvedValue(null);
    const settings = await loadSupplierSettings();
    expect(settings.updatedAt).toBeNull();
    expect(settings.updatedByName).toBeNull();
  });
});

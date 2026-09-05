import { beforeEach, describe, expect, it, vi } from "vitest";

const productCreate = vi.fn();
const productUpdate = vi.fn();
const productFindUnique = vi.fn();
const priceCreate = vi.fn();

const tx = {
  product: { create: productCreate, update: productUpdate },
  productPrice: { create: priceCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findUnique: productFindUnique, update: productUpdate },
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
  },
}));

class UnauthorizedError extends Error {}
const requireSuperAdmin = vi.fn();
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError,
  requireSuperAdmin: () => requireSuperAdmin(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/r2", () => ({ deleteObject: vi.fn() }));

const { archiveProduct, createProduct, updateProduct } = await import(
  "@/actions/products"
);

const admin = {
  id: "user-1",
  email: "chris@lovinghandsportal.com",
  name: "Chris Lam",
  image: null,
  role: "SUPER_ADMIN",
  mustChangePassword: false,
};

const input = {
  name: "Granite stepping stone 40cm",
  sku: "STN-GRA-040",
  category: "Stone" as const,
  unit: "piece",
  listPrice: "42.50",
  description: null,
  active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdmin.mockResolvedValue(admin);
  productCreate.mockResolvedValue({ id: "prod-1" });
  productUpdate.mockResolvedValue({});
  priceCreate.mockResolvedValue({});
  productFindUnique.mockResolvedValue({
    listPrice: { equals: (other: { toString(): string }) => other.toString() === "42.5" },
  });
});

describe("permissions", () => {
  // The UI hides these controls from a member; this is what actually stops
  // them. Calling the action directly is the case that matters.
  const refused = { success: false, error: "This action needs super admin access." };

  beforeEach(() => {
    requireSuperAdmin.mockRejectedValue(
      new UnauthorizedError("This action needs super admin access."),
    );
  });

  it("refuses createProduct for anyone but a super admin", async () => {
    expect(await createProduct(input)).toEqual(refused);
    expect(productCreate).not.toHaveBeenCalled();
  });

  it("refuses updateProduct", async () => {
    expect(await updateProduct("prod-1", input)).toEqual(refused);
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it("refuses archiveProduct", async () => {
    expect(await archiveProduct("prod-1")).toEqual(refused);
    expect(productUpdate).not.toHaveBeenCalled();
  });
});

describe("createProduct", () => {
  it("writes the first price as history, so the trend has an origin", async () => {
    const result = await createProduct(input);
    expect(result.success).toBe(true);
    expect(priceCreate).toHaveBeenCalledOnce();
    expect(priceCreate.mock.calls[0][0].data.setById).toBe("user-1");
  });

  it("refuses an invalid SKU before touching the database", async () => {
    const result = await createProduct({ ...input, sku: "stn gra 040" });
    expect(result.success).toBe(false);
    expect(productCreate).not.toHaveBeenCalled();
  });

  it("refuses a list price of zero", async () => {
    const result = await createProduct({ ...input, listPrice: "0" });
    expect(result.success).toBe(false);
    expect(productCreate).not.toHaveBeenCalled();
  });
});

describe("updateProduct — price history", () => {
  it("appends a ProductPrice row when the price moves", async () => {
    const result = await updateProduct("prod-1", { ...input, listPrice: "45.00" });
    expect(result.success).toBe(true);
    expect(priceCreate).toHaveBeenCalledOnce();
    expect(priceCreate.mock.calls[0][0].data.price.toString()).toBe("45");
  });

  it("appends nothing when the price is unchanged", async () => {
    // A row per save would make the trend a record of edits, not of prices.
    const result = await updateProduct("prod-1", input);
    expect(result.success).toBe(true);
    expect(priceCreate).not.toHaveBeenCalled();
  });

  it("still saves the other fields when the price is unchanged", async () => {
    await updateProduct("prod-1", { ...input, name: "Renamed" });
    expect(productUpdate).toHaveBeenCalledOnce();
    expect(productUpdate.mock.calls[0][0].data.name).toBe("Renamed");
  });

  it("reports a missing product rather than throwing", async () => {
    productFindUnique.mockResolvedValue(null);
    expect(await updateProduct("gone", input)).toEqual({
      success: false,
      error: "That product is gone.",
    });
  });
});

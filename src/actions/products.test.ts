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
  category: "Shower cream & gel" as const,
  unit: "carton",
  listPrice: "42.50",
  brand: "ZEN GARDEN",
  variant: "Goat's Milk",
  packSize: 6,
  market: "Malaysia",
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

  it("refuses an unusable SKU before touching the database", async () => {
    // Spaces and slashes are allowed since 2026-09-09 — real orders print them
    // — so an empty code is what has to be refused now.
    const result = await createProduct({ ...input, sku: "  " });
    expect(result.success).toBe(false);
    expect(productCreate).not.toHaveBeenCalled();
  });

  it("stores a SKU normalised, so one code cannot enter the catalogue twice", async () => {
    await createProduct({ ...input, sku: " zen/sc/2100/carrot " });
    expect(productCreate.mock.calls[0][0].data.sku).toBe("ZEN/SC/2100/CARROT");
  });

  it("refuses a list price of zero", async () => {
    const result = await createProduct({ ...input, listPrice: "0" });
    expect(result.success).toBe(false);
    expect(productCreate).not.toHaveBeenCalled();
  });

  it("persists brand, variant and pack size", async () => {
    await createProduct({ ...input, packSize: "12" });
    const { data } = productCreate.mock.calls[0][0];
    expect([data.brand, data.variant, data.packSize]).toEqual([
      "ZEN GARDEN",
      "Goat's Milk",
      12,
    ]);
  });

  it("persists the market", async () => {
    await createProduct({ ...input, market: "Vietnam" });
    expect(productCreate.mock.calls[0][0].data.market).toBe("Vietnam");
  });

  it("stores a blank market as null, so the picker never offers an empty row", async () => {
    await createProduct({ ...input, market: "  " });
    expect(productCreate.mock.calls[0][0].data.market).toBeNull();
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

  it("saves a changed market", async () => {
    await updateProduct("prod-1", { ...input, market: "Mydin" });
    expect(productUpdate.mock.calls[0][0].data.market).toBe("Mydin");
  });

  it("clears the market when it is emptied", async () => {
    // Editing to blank must remove the market, not keep the previous one.
    await updateProduct("prod-1", { ...input, market: null });
    expect(productUpdate.mock.calls[0][0].data.market).toBeNull();
  });

  it("reports a missing product rather than throwing", async () => {
    productFindUnique.mockResolvedValue(null);
    expect(await updateProduct("gone", input)).toEqual({
      success: false,
      error: "That product is gone.",
    });
  });
});

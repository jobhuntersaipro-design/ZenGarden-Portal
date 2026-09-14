import { beforeEach, describe, expect, it, vi } from "vitest";

const productCreate = vi.fn();
const productUpdate = vi.fn();
const productFindUnique = vi.fn();
const productDelete = vi.fn();
const priceCreate = vi.fn();
// Phase 28: a product write registers whatever it was given in the catalogue's
// vocabulary, inside the same transaction.
const labelFindFirst = vi.fn();
const labelCreate = vi.fn();

const tx = {
  product: { create: productCreate, update: productUpdate },
  productPrice: { create: priceCreate },
  catalogLabel: { findFirst: labelFindFirst, create: labelCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findUnique: productFindUnique,
      update: productUpdate,
      delete: productDelete,
    },
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
const deleteObject = vi.fn();
vi.mock("@/lib/r2", () => ({ deleteObject: (key: string) => deleteObject(key) }));

const { createProduct, deleteProduct, setProductPublished, updateProduct } =
  await import("@/actions/products");
const { NEEDS_AN_IMAGE } = await import("@/lib/validation/product-images");

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
  cartonsPerPallet: 60,
  market: "Malaysia",
  description: null,
  active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdmin.mockResolvedValue(admin);
  productCreate.mockResolvedValue({ id: "prod-1" });
  productUpdate.mockResolvedValue({});
  productDelete.mockResolvedValue({});
  deleteObject.mockResolvedValue(undefined);
  priceCreate.mockResolvedValue({});
  // Every value already on record, so the default case writes no labels.
  labelFindFirst.mockResolvedValue({ id: "lbl-1" });
  labelCreate.mockResolvedValue({});
  productFindUnique.mockResolvedValue({
    listPrice: { equals: (other: { toString(): string }) => other.toString() === "42.5" },
    // One picture, which every product has carried since Phase 27. The gate
    // that depends on this has its own describe block below.
    _count: { images: 1 },
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

  it("refuses setProductPublished", async () => {
    expect(await setProductPublished("prod-1", false)).toEqual(refused);
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

describe("createProduct — the vocabulary keeps what was typed", () => {
  it("registers a value the catalogue has never seen", async () => {
    // "Pet care" typed into the picker has to outlive the product it was typed
    // on; otherwise deleting that product takes the category with it.
    labelFindFirst.mockResolvedValue(null);

    await createProduct({ ...input, brand: "New Brand" });

    expect(labelCreate).toHaveBeenCalledWith({
      data: { kind: "BRAND", value: "New Brand" },
    });
  });

  it("registers nothing that is already on record", async () => {
    await createProduct(input);

    expect(labelCreate).not.toHaveBeenCalled();
  });

  it("registers inside the product's own transaction", async () => {
    labelFindFirst.mockResolvedValue(null);

    await createProduct(input);

    // The mocked `$transaction` hands `tx` to the callback, so a label written
    // through it is a label written in the transaction — the assertion that
    // would fail if the action reached for the bare client instead.
    expect(labelFindFirst).toHaveBeenCalled();
    expect(labelCreate).toHaveBeenCalled();
  });
});

describe("updateProduct — a product carries at least one picture", () => {
  it("refuses to save a product with no images", async () => {
    productFindUnique.mockResolvedValue({
      listPrice: { equals: () => true },
      _count: { images: 0 },
    });

    expect(await updateProduct("prod-1", input)).toEqual({
      success: false,
      error: NEEDS_AN_IMAGE,
    });
    // Refused before the write, not rolled back after it.
    expect(productUpdate).not.toHaveBeenCalled();
    expect(priceCreate).not.toHaveBeenCalled();
  });

  it("saves a product that has one", async () => {
    const result = await updateProduct("prod-1", input);

    expect(result.success).toBe(true);
    expect(productUpdate).toHaveBeenCalled();
  });

  it("still unpublishes a product with no images", async () => {
    // Unpublishing is the reasonable answer to a product nobody photographed;
    // gating it would leave the imported catalogue with no move at all.
    productFindUnique.mockResolvedValue({
      listPrice: { equals: () => true },
      _count: { images: 0 },
    });

    const result = await setProductPublished("prod-1", false);

    expect(result.success).toBe(true);
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: "prod-1" },
      data: { active: false },
    });
  });

  it("publishes as well as unpublishes", async () => {
    const result = await setProductPublished("prod-1", true);

    expect(result.success).toBe(true);
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: "prod-1" },
      data: { active: true },
    });
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

describe("deleteProduct", () => {
  const product = {
    id: "prod-1",
    name: "Granite stepping stone 40cm",
    images: [
      { r2Key: "products/prod-1/a.jpg", thumbKey: "products/prod-1/a.1600.webp" },
    ],
    _count: { lineItems: 0, webOrderLines: 0 },
  };

  it("refuses a name that does not match, before anything is deleted", async () => {
    productFindUnique.mockResolvedValue(product);

    const result = await deleteProduct("prod-1", "granite stepping stone");

    expect(result).toEqual({
      success: false,
      error: "That name doesn't match. Type the product's name exactly to delete it.",
    });
    expect(productDelete).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("accepts the name in any casing, with surrounding space", async () => {
    productFindUnique.mockResolvedValue(product);

    const result = await deleteProduct("prod-1", "  granite STEPPING stone 40cm  ");

    expect(result.success).toBe(true);
    expect(productDelete).toHaveBeenCalledWith({ where: { id: "prod-1" } });
  });

  it("refuses while purchase-order lines reference it", async () => {
    productFindUnique.mockResolvedValue({
      ...product,
      _count: { lineItems: 14, webOrderLines: 0 },
    });

    const result = await deleteProduct("prod-1", product.name);

    expect(result).toEqual({
      success: false,
      error:
        "14 purchase-order lines reference this product, so it can't be deleted. Unpublish it instead.",
    });
    expect(productDelete).not.toHaveBeenCalled();
  });

  it("refuses while a shop order references it", async () => {
    productFindUnique.mockResolvedValue({
      ...product,
      _count: { lineItems: 0, webOrderLines: 1 },
    });

    const result = await deleteProduct("prod-1", product.name);

    expect(result.success).toBe(false);
    expect(productDelete).not.toHaveBeenCalled();
  });

  it("deletes both R2 objects of every image", async () => {
    productFindUnique.mockResolvedValue(product);

    await deleteProduct("prod-1", product.name);

    expect(deleteObject).toHaveBeenCalledWith("products/prod-1/a.jpg");
    expect(deleteObject).toHaveBeenCalledWith("products/prod-1/a.1600.webp");
  });

  it("still reports success when R2 refuses an object", async () => {
    // The row is already gone by then; telling the reader the delete failed
    // would be false, and the orphan costs storage rather than correctness.
    productFindUnique.mockResolvedValue(product);
    deleteObject.mockRejectedValue(new Error("nope"));

    const result = await deleteProduct("prod-1", product.name);

    expect(result.success).toBe(true);
  });
});

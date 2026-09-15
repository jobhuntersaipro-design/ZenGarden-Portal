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
// Phase 36: a family described on the form is created in the same transaction.
const familyCreate = vi.fn();
// Phase 39: copying a variant's photographs reads and writes ProductImage
// directly, never through a transaction (see copyImagesToVariants's own
// doc comment for why).
const imageFindMany = vi.fn();
const imageCount = vi.fn();
const imageCreate = vi.fn();
const imageUpdate = vi.fn();
const imageDelete = vi.fn();

const tx = {
  product: { create: productCreate, update: productUpdate },
  productPrice: { create: priceCreate },
  catalogLabel: { findFirst: labelFindFirst, create: labelCreate },
  productFamily: { create: familyCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findUnique: productFindUnique,
      update: productUpdate,
      delete: productDelete,
    },
    productImage: {
      findMany: imageFindMany,
      count: imageCount,
      create: imageCreate,
      update: imageUpdate,
      delete: imageDelete,
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

// r2.ts builds an S3 client at import time, which needs the full env. Same
// block as src/lib/r2.test.ts — the real key builders are wanted here, so the
// real module has to load.
vi.mock("@/lib/env", () => ({
  env: {
    R2_ACCOUNT_ID: "acct",
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET: "bucket",
  },
}));

const deleteObject = vi.fn();
const copyObject = vi.fn();
vi.mock("@/lib/r2", async () => {
  const actual = await vi.importActual<typeof import("@/lib/r2")>("@/lib/r2");
  return {
    ...actual,
    deleteObject: (key: string) => deleteObject(key),
    copyObject: (from: string, to: string) => copyObject(from, to),
  };
});

const {
  copyImagesToVariants,
  createProduct,
  createProductVariants,
  deleteProduct,
  setProductPublished,
  updateProduct,
} = await import("@/actions/products");
const { NEEDS_AN_IMAGE } = await import("@/lib/validation/product-images");
const { Prisma } = await import("@/generated/prisma/client");

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
  familyId: null,
  newFamily: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdmin.mockResolvedValue(admin);
  productCreate.mockResolvedValue({ id: "prod-1" });
  familyCreate.mockResolvedValue({ id: "fam-1" });
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

describe("createProduct — the family it is a variant of", () => {
  const newFamily = {
    code: "zen-sc-2100",
    name: "Zen Garden Shower Cream 2.1L",
    brand: "ZEN GARDEN",
    category: "Shower cream & gel",
    size: "2.1L",
  };

  it("links an existing family by id and creates none", async () => {
    await createProduct({ ...input, familyId: "fam-9" });
    expect(familyCreate).not.toHaveBeenCalled();
    expect(productCreate.mock.calls[0][0].data.familyId).toBe("fam-9");
  });

  it("creates a family described on the form first, then the product in it", async () => {
    await createProduct({ ...input, newFamily });

    expect(familyCreate).toHaveBeenCalledOnce();
    // Normalised like a SKU: one case, so a code cannot enter twice.
    expect(familyCreate.mock.calls[0][0].data.code).toBe("ZEN-SC-2100");
    expect(familyCreate.mock.invocationCallOrder[0]).toBeLessThan(
      productCreate.mock.invocationCallOrder[0],
    );
    expect(productCreate.mock.calls[0][0].data.familyId).toBe("fam-1");
  });

  it("refuses a product that names an existing family and describes a new one", async () => {
    const result = await createProduct({ ...input, familyId: "fam-9", newFamily });
    expect(result.success).toBe(false);
    expect(productCreate).not.toHaveBeenCalled();
    expect(familyCreate).not.toHaveBeenCalled();
  });

  it("names the family code, not the SKU, when the family's code is taken", async () => {
    const { Prisma } = await import("@/generated/prisma/client");
    familyCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "7",
        // The shape Prisma 7's driver adapter really emits (client-invites.ts).
        meta: {
          driverAdapterError: {
            cause: { constraint: { fields: ["code"], name: "ProductFamily_code_key" } },
          },
        },
      }),
    );

    expect(await createProduct({ ...input, newFamily })).toEqual({
      success: false,
      error: "That family code is already in use.",
    });
  });

  it("still names the SKU when that is what clashed", async () => {
    const { Prisma } = await import("@/generated/prisma/client");
    productCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "7",
        meta: { target: ["sku"] },
      }),
    );

    expect(await createProduct(input)).toEqual({
      success: false,
      error: "That SKU is already in use.",
    });
  });

  it("moves a product between families on update", async () => {
    await updateProduct("prod-1", { ...input, familyId: "fam-2" });
    expect(productUpdate.mock.calls[0][0].data.familyId).toBe("fam-2");
  });

  it("takes a product out of its family when told none", async () => {
    await updateProduct("prod-1", { ...input, familyId: null });
    expect(productUpdate.mock.calls[0][0].data.familyId).toBeNull();
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

describe("createProductVariants", () => {
  /** The shared half, matching the form's own shape. */
  const shared = {
    name: "Zen Garden Shower Cream 2.1L",
    category: "Shower cream & gel",
    unit: "carton",
    brand: "ZEN GARDEN",
    packSize: 6,
    cartonsPerPallet: 60,
    market: "Vietnam",
    description: null,
    active: true,
    familyId: null,
    newFamily: null,
  };

  const threeRows = [
    { variant: "Goat's Milk", sku: "ZEN-SC-2100-GM-VN", listPrice: "189.00" },
    { variant: "Papaya", sku: "ZEN-SC-2100-PP-VN", listPrice: "189.00" },
    { variant: "Lavender", sku: "ZEN-SC-2100-LV-VN", listPrice: "195.50" },
  ];

  beforeEach(() => {
    requireSuperAdmin.mockResolvedValue(admin);
    labelFindFirst.mockResolvedValue({ id: "label-1" });
    let seq = 0;
    productCreate.mockImplementation(({ data }: { data: { sku: string } }) => {
      seq += 1;
      return Promise.resolve({ id: `prd-${seq}`, sku: data.sku });
    });
    priceCreate.mockResolvedValue({ id: "price-1" });
    familyCreate.mockResolvedValue({ id: "fam-new" });
  });

  it("writes one product and one price per variant, in row order", async () => {
    const result = await createProductVariants({
      ...shared,
      familyId: "fam-1",
      variants: threeRows,
    });

    expect(result).toEqual({
      success: true,
      data: {
        familyId: "fam-1",
        variants: [
          { id: "prd-1", sku: "ZEN-SC-2100-GM-VN" },
          { id: "prd-2", sku: "ZEN-SC-2100-PP-VN" },
          { id: "prd-3", sku: "ZEN-SC-2100-LV-VN" },
        ],
      },
    });
    expect(productCreate).toHaveBeenCalledTimes(3);
    expect(priceCreate).toHaveBeenCalledTimes(3);
  });

  it("gives every variant the shared fields and its own flavour, code and price", async () => {
    await createProductVariants({ ...shared, familyId: "fam-1", variants: threeRows });

    const rows = productCreate.mock.calls.map(([args]) => args.data);
    expect(rows.map((row) => row.name)).toEqual([
      "Zen Garden Shower Cream 2.1L",
      "Zen Garden Shower Cream 2.1L",
      "Zen Garden Shower Cream 2.1L",
    ]);
    expect(rows.map((row) => row.familyId)).toEqual(["fam-1", "fam-1", "fam-1"]);
    expect(rows.map((row) => row.packSize)).toEqual([6, 6, 6]);
    expect(rows.map((row) => row.variant)).toEqual([
      "Goat's Milk",
      "Papaya",
      "Lavender",
    ]);
    expect(rows.map((row) => String(row.listPrice))).toEqual([
      "189",
      "189",
      "195.5",
    ]);
  });

  it("creates a described family once and points every variant at it", async () => {
    const result = await createProductVariants({
      ...shared,
      newFamily: {
        code: "ZEN-SC-2100",
        name: "Zen Garden Shower Cream 2.1L",
        brand: "ZEN GARDEN",
        category: "Shower cream & gel",
        size: "2.1L",
      },
      variants: threeRows,
    });

    expect(familyCreate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true, data: { familyId: "fam-new" } });
    const rows = productCreate.mock.calls.map(([args]) => args.data);
    expect(rows.every((row) => row.familyId === "fam-new")).toBe(true);
  });

  it("registers each variant's own label", async () => {
    await createProductVariants({ ...shared, familyId: "fam-1", variants: threeRows });

    // Phase 28's registry is called per variant, with *that* variant's own
    // flavour — not the shared fields registered once. Reading the VARIANT
    // lookups back by their actual `where.value.equals` is what tells the two
    // apart: a regression that hoisted `row.variant` out of the loop would
    // still call `registerLabels` three times (once per product created) but
    // every lookup would carry the same flavour instead of three distinct
    // ones.
    const variantLookups = labelFindFirst.mock.calls
      .map((call) => (call[0] as { where: { kind: string; value: { equals: string } } }).where)
      .filter((where) => where.kind === "VARIANT")
      .map((where) => where.value.equals);
    expect(variantLookups).toEqual(["Goat's Milk", "Papaya", "Lavender"]);
  });

  it("writes nothing when a SKU is repeated in the batch", async () => {
    const result = await createProductVariants({
      ...shared,
      familyId: "fam-1",
      variants: [threeRows[0]!, { ...threeRows[1]!, sku: threeRows[0]!.sku }],
    });

    expect(result).toEqual({
      success: false,
      error:
        "Two variants carry the SKU ZEN-SC-2100-GM-VN. Every variant needs its own.",
    });
    expect(productCreate).not.toHaveBeenCalled();
  });

  it("writes nothing when a second variant has no family", async () => {
    const result = await createProductVariants({ ...shared, variants: threeRows });

    expect(result).toEqual({
      success: false,
      error:
        "Two or more variants need a family, so the shop shows them as one product.",
    });
    expect(productCreate).not.toHaveBeenCalled();
  });

  it("reports a duplicate SKU the database refuses", async () => {
    productCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "7",
        meta: { target: ["sku"] },
      }),
    );

    const result = await createProductVariants({
      ...shared,
      familyId: "fam-1",
      variants: threeRows,
    });
    expect(result).toEqual({ success: false, error: "That SKU is already in use." });
  });

  it("leaves no product behind when the family's code is taken", async () => {
    // The family is created first inside the transaction, so a collision on
    // its code is reached before any product row is attempted. Spec
    // criterion 6.
    familyCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "7",
        meta: {
          driverAdapterError: { cause: { constraint: { fields: ["code"] } } },
        },
      }),
    );

    const result = await createProductVariants({
      ...shared,
      newFamily: {
        code: "ZEN-SC-2100",
        name: "Zen Garden Shower Cream 2.1L",
        brand: "ZEN GARDEN",
        category: "Shower cream & gel",
        size: "2.1L",
      },
      variants: threeRows,
    });

    expect(result).toEqual({
      success: false,
      error: "That family code is already in use.",
    });
    expect(productCreate).not.toHaveBeenCalled();
  });

  it("fails the whole submit when the third variant collides", async () => {
    // What this pins is that the action reports a failure rather than a
    // partial success. The *rollback* is Postgres's, and a mocked
    // `$transaction` cannot prove it — Task 7 reads the product count back
    // from the real database for that.
    productCreate
      .mockImplementationOnce(() => Promise.resolve({ id: "prd-1", sku: "a" }))
      .mockImplementationOnce(() => Promise.resolve({ id: "prd-2", sku: "b" }))
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("dup", {
          code: "P2002",
          clientVersion: "7",
          meta: { target: ["sku"] },
        }),
      );

    const result = await createProductVariants({
      ...shared,
      familyId: "fam-1",
      variants: threeRows,
    });
    expect(result).toEqual({ success: false, error: "That SKU is already in use." });
  });

  it("refuses anyone who is not a super admin", async () => {
    requireSuperAdmin.mockRejectedValue(
      new UnauthorizedError("This action needs super admin access."),
    );
    const result = await createProductVariants({
      ...shared,
      familyId: "fam-1",
      variants: threeRows,
    });
    expect(result).toEqual({
      success: false,
      error: "This action needs super admin access.",
    });
    expect(productCreate).not.toHaveBeenCalled();
  });
});

describe("copyImagesToVariants", () => {
  const source = [
    {
      r2Key: "products/prd-1/img-a.jpg",
      thumbKey: "products/prd-1/img-a.1600.webp",
      sizeBytes: 12345,
      position: 0,
    },
    {
      r2Key: "products/prd-1/img-b.png",
      thumbKey: "products/prd-1/img-b.1600.webp",
      sizeBytes: 6789,
      position: 1,
    },
  ];

  beforeEach(() => {
    requireSuperAdmin.mockResolvedValue(admin);
    imageFindMany.mockResolvedValue(source);
    imageCount.mockResolvedValue(0);
    let seq = 0;
    imageCreate.mockImplementation(() => {
      seq += 1;
      return Promise.resolve({ id: `new-${seq}` });
    });
    imageUpdate.mockResolvedValue({});
    copyObject.mockResolvedValue({});
  });

  it("copies both objects of every image to every target", async () => {
    const result = await copyImagesToVariants("prd-1", ["prd-2", "prd-3"]);

    expect(result).toEqual({ success: true, data: { copied: 4, failed: 0, skipped: 0 } });
    // Two images × two targets × the original and its derivative.
    expect(copyObject).toHaveBeenCalledTimes(8);
    expect(copyObject).toHaveBeenCalledWith(
      "products/prd-1/img-a.jpg",
      "products/prd-2/new-1.jpg",
    );
    expect(copyObject).toHaveBeenCalledWith(
      "products/prd-1/img-a.1600.webp",
      "products/prd-2/new-1.1600.webp",
    );
    // The extension follows the source, so a PNG does not become a JPG.
    expect(copyObject).toHaveBeenCalledWith(
      "products/prd-1/img-b.png",
      "products/prd-2/new-2.png",
    );
  });

  it("writes the row before the copy and points it at the real keys after", async () => {
    await copyImagesToVariants("prd-1", ["prd-2"]);

    const created = imageCreate.mock.calls[0]?.[0]?.data;
    expect(created.productId).toBe("prd-2");
    expect(created.position).toBe(0);
    expect(created.sizeBytes).toBe(12345);
    // A unique r2Key is needed before the row's own id exists — the Phase 03
    // placeholder, never a real object.
    expect(String(created.r2Key).startsWith("pending:")).toBe(true);

    expect(imageUpdate).toHaveBeenCalledWith({
      where: { id: "new-1" },
      data: {
        r2Key: "products/prd-2/new-1.jpg",
        thumbKey: "products/prd-2/new-1.1600.webp",
      },
    });
  });

  it("offsets positions past whatever the target already has", async () => {
    imageCount.mockResolvedValue(2);
    await copyImagesToVariants("prd-1", ["prd-2"]);
    expect(imageCreate.mock.calls.map(([args]) => args.data.position)).toEqual([2, 3]);
  });

  // Fix 3 (final whole-branch review): the upload path refuses a file once a
  // product already holds MAX_IMAGES_PER_PRODUCT (8), via `rejectionReason`
  // in the presign route — but the copy path offset positions past whatever a
  // target already held with no such ceiling, so a target with 7 of its own
  // plus a 2-image shared set landed at 9. Skipped units must never be
  // reported as failed: nothing was attempted for them, so they are neither
  // copied nor a failure.
  it("skips a unit that would push a target past the 8-image cap, without attempting it", async () => {
    // prd-2 already holds 7 images. The two-image shared set would land at
    // positions 7 and 8 — only the first fits under the cap.
    imageCount.mockResolvedValue(7);

    const result = await copyImagesToVariants("prd-1", ["prd-2"]);

    expect(result).toEqual({ success: true, data: { copied: 1, failed: 0, skipped: 1 } });
    // The skipped unit is never attempted: one create, one pair of copies —
    // not a create that is then rolled back.
    expect(imageCreate).toHaveBeenCalledTimes(1);
    expect(imageCreate.mock.calls[0][0].data.position).toBe(7);
    expect(copyObject).toHaveBeenCalledTimes(2);
  });

  it("skips every unit for a target already at the cap", async () => {
    imageCount.mockResolvedValue(8);

    const result = await copyImagesToVariants("prd-1", ["prd-2"]);

    expect(result).toEqual({ success: true, data: { copied: 0, failed: 0, skipped: 2 } });
    expect(imageCreate).not.toHaveBeenCalled();
    expect(copyObject).not.toHaveBeenCalled();
  });

  it("collapses duplicate target ids so they don't collide on position", async () => {
    // The count that offsets a target's positions is read once per
    // *distinct* target before any unit runs — two entries of the same id
    // would each be handed that same count and propose the same positions
    // for both passes, which `@@unique([productId, position])` would refuse
    // on the second write. One target's worth of copies is the only
    // correct reading of "copy to prd-2, twice".
    const result = await copyImagesToVariants("prd-1", ["prd-2", "prd-2"]);

    expect(result).toEqual({ success: true, data: { copied: 2, failed: 0, skipped: 0 } });
    expect(imageCreate).toHaveBeenCalledTimes(2);
    expect(imageCreate.mock.calls.map(([args]) => args.data.position)).toEqual([0, 1]);
    expect(copyObject).toHaveBeenCalledTimes(4);
  });

  it("deletes the row when a copy fails, so no unloadable tile is left", async () => {
    imageDelete.mockResolvedValue({});
    // Keyed on the destination key, not on `copyObject`'s call position: the
    // two images' copy units now run concurrently (Fix 3), so which one the
    // mock queue happens to serve first is no longer meaningful. This fails
    // image-a's row (its create call — and so its row id — is still
    // deterministic: units are dispatched to the pool in image order, and
    // both fit inside one wave of COPY_CONCURRENCY).
    copyObject.mockImplementation((_from: string, to: string) =>
      to === "products/prd-2/new-1.jpg"
        ? Promise.reject(new Error("R2 said no"))
        : Promise.resolve({}),
    );

    const result = await copyImagesToVariants("prd-1", ["prd-2"]);

    expect(result).toEqual({ success: true, data: { copied: 1, failed: 1, skipped: 0 } });
    expect(imageDelete).toHaveBeenCalledWith({ where: { id: "new-1" } });
  });

  it("deletes the orphaned original when only the derivative's copy fails", async () => {
    // image-a's original succeeds and writes a real R2 object; its derivative
    // fails. Without cleanup, that first object is left in the bucket with no
    // row pointing at it. Keyed on the destination key rather than on
    // `copyObject`'s call position, for the same reason as the test above.
    copyObject.mockImplementation((_from: string, to: string) =>
      to === "products/prd-2/new-1.1600.webp"
        ? Promise.reject(new Error("R2 said no"))
        : Promise.resolve({}),
    );
    imageDelete.mockResolvedValue({});

    const result = await copyImagesToVariants("prd-1", ["prd-2"]);

    expect(result).toEqual({ success: true, data: { copied: 1, failed: 1, skipped: 0 } });
    expect(deleteObject).toHaveBeenCalledWith("products/prd-2/new-1.jpg");
    expect(imageDelete).toHaveBeenCalledWith({ where: { id: "new-1" } });
  });

  it("only copies images that have been processed", async () => {
    await copyImagesToVariants("prd-1", ["prd-2"]);
    expect(imageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: "prd-1", thumbKey: { not: null } },
      }),
    );
  });

  it("says so when the source has no processed image", async () => {
    imageFindMany.mockResolvedValue([]);
    const result = await copyImagesToVariants("prd-1", ["prd-2"]);
    expect(result).toEqual({
      success: false,
      error: "That product has no processed images to copy.",
    });
    expect(copyObject).not.toHaveBeenCalled();
  });

  it("does nothing, successfully, with no targets", async () => {
    const result = await copyImagesToVariants("prd-1", []);
    expect(result).toEqual({ success: true, data: { copied: 0, failed: 0, skipped: 0 } });
    expect(imageFindMany).not.toHaveBeenCalled();
  });

  it("returns a result rather than throwing when a database read fails", async () => {
    // findMany and count sit outside the per-image try/catch — a transient
    // failure there must still resolve to the module's standard shape rather
    // than reject the Server Action.
    imageFindMany.mockRejectedValue(new Error("connection reset"));

    const result = await copyImagesToVariants("prd-1", ["prd-2"]);

    expect(result).toEqual({
      success: false,
      error: "We couldn't copy those images.",
    });
  });

  it("never runs more than 6 copy units at once", async () => {
    // 10 targets × 1 image = 10 units, comfortably past the concurrency bound
    // (6) this test exists to pin. Every mock resolves after a real, short
    // delay so units genuinely overlap in time rather than settling on
    // already-resolved promises in call order, which would prove nothing
    // about a runtime bound.
    const targets = Array.from({ length: 10 }, (_, i) => `prd-target-${i}`);
    imageFindMany.mockResolvedValue([source[0]]);
    imageCount.mockResolvedValue(0);

    let active = 0;
    let maxActive = 0;
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let seq = 0;

    imageCreate.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(5);
      seq += 1;
      return { id: `row-${seq}` };
    });
    copyObject.mockImplementation(async () => {
      await delay(1);
      return {};
    });
    imageUpdate.mockImplementation(async () => {
      await delay(1);
      // The unit is done the moment its row is pointed at real keys — this is
      // where a worker frees up to pick the next one.
      active -= 1;
      return {};
    });

    const result = await copyImagesToVariants("prd-1", targets);

    expect(result).toEqual({ success: true, data: { copied: 10, failed: 0, skipped: 0 } });
    expect(maxActive).toBeLessThanOrEqual(6);
    // Ten units and a bound of six means the ceiling is actually exercised,
    // not just never violated by coincidence.
    expect(maxActive).toBe(6);
  });

  it("refuses anyone who is not a super admin", async () => {
    requireSuperAdmin.mockRejectedValue(
      new UnauthorizedError("This action needs super admin access."),
    );
    const result = await copyImagesToVariants("prd-1", ["prd-2"]);
    expect(result).toEqual({
      success: false,
      error: "This action needs super admin access.",
    });
    expect(copyObject).not.toHaveBeenCalled();
  });
});

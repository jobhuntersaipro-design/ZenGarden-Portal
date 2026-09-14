import { beforeEach, describe, expect, it, vi } from "vitest";

const labelFindUnique = vi.fn();
const labelFindFirst = vi.fn();
const labelCreate = vi.fn();
const labelUpdate = vi.fn();
const labelDelete = vi.fn();
const productCount = vi.fn();
const productUpdateMany = vi.fn();

const tx = {
  catalogLabel: { update: labelUpdate },
  product: { updateMany: productUpdateMany },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    catalogLabel: {
      findUnique: labelFindUnique,
      findFirst: labelFindFirst,
      create: labelCreate,
      update: labelUpdate,
      delete: labelDelete,
    },
    product: { count: productCount, updateMany: productUpdateMany },
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

const { createLabel, removeLabel, renameLabel } = await import(
  "@/actions/catalog-labels"
);

const admin = {
  id: "user-1",
  email: "chris@lovinghandsportal.com",
  name: "Chris Lam",
  image: null,
  role: "SUPER_ADMIN",
  mustChangePassword: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdmin.mockResolvedValue(admin);
  labelFindFirst.mockResolvedValue(null);
  labelCreate.mockResolvedValue({ id: "lbl-new" });
  labelUpdate.mockResolvedValue({});
  labelDelete.mockResolvedValue({});
  productCount.mockResolvedValue(0);
  productUpdateMany.mockResolvedValue({ count: 0 });
});

describe("permissions", () => {
  const refused = { success: false, error: "This action needs super admin access." };

  beforeEach(() => {
    requireSuperAdmin.mockRejectedValue(
      new UnauthorizedError("This action needs super admin access."),
    );
  });

  it("refuses every write to anyone but a super admin", async () => {
    expect(await createLabel({ kind: "BRAND", value: "Zen" })).toEqual(refused);
    expect(await renameLabel({ id: "lbl-1", value: "Zen" })).toEqual(refused);
    expect(await removeLabel("lbl-1")).toEqual(refused);
    expect(labelCreate).not.toHaveBeenCalled();
    expect(labelUpdate).not.toHaveBeenCalled();
    expect(labelDelete).not.toHaveBeenCalled();
  });
});

describe("createLabel", () => {
  it("creates a value no product carries yet", async () => {
    const result = await createLabel({ kind: "MARKET", value: "  Brunei  " });

    expect(result.success).toBe(true);
    // Trimmed, and inner whitespace collapsed, so the list cannot hold two
    // values that read the same.
    expect(labelCreate).toHaveBeenCalledWith({
      data: { kind: "MARKET", value: "Brunei" },
      select: { id: true },
    });
  });

  it("refuses a value that already exists in another casing", async () => {
    labelFindFirst.mockResolvedValue({ value: "Mydin" });

    const result = await createLabel({ kind: "MARKET", value: "mydin" });

    expect(result).toEqual({
      success: false,
      error: "There is already a market called “Mydin”.",
    });
    expect(labelCreate).not.toHaveBeenCalled();
  });

  it("refuses an empty value", async () => {
    expect(await createLabel({ kind: "BRAND", value: "   " })).toEqual({
      success: false,
      error: "Type a value first",
    });
  });
});

describe("renameLabel", () => {
  const label = { id: "lbl-1", kind: "BRAND", value: "ZEN GARDEN" };

  it("rewrites the label and every product carrying it, in one transaction", async () => {
    labelFindUnique.mockResolvedValue(label);
    productUpdateMany.mockResolvedValue({ count: 161 });

    const result = await renameLabel({ id: "lbl-1", value: "Zen Garden" });

    expect(result).toEqual({ success: true, data: { products: 161, value: "Zen Garden" } });
    expect(labelUpdate).toHaveBeenCalledWith({
      where: { id: "lbl-1" },
      data: { value: "Zen Garden" },
    });
    // Insensitively, or a row written by an import in another casing would be
    // stranded under a value the picker no longer offers.
    expect(productUpdateMany).toHaveBeenCalledWith({
      where: { brand: { equals: "ZEN GARDEN", mode: "insensitive" } },
      data: { brand: "Zen Garden" },
    });
  });

  it("writes the product update through the transaction client", async () => {
    labelFindUnique.mockResolvedValue(label);

    await renameLabel({ id: "lbl-1", value: "Zen Garden" });

    // Both writes go through `tx`, so a failure halfway cannot leave the
    // vocabulary renamed and the products behind.
    expect(tx.catalogLabel.update).toBe(labelUpdate);
    expect(tx.product.updateMany).toBe(productUpdateMany);
  });

  it("refuses renaming onto an existing value of the same kind", async () => {
    labelFindUnique.mockResolvedValue(label);
    labelFindFirst.mockResolvedValue({ value: "MR. KING" });

    const result = await renameLabel({ id: "lbl-1", value: "mr. king" });

    expect(result).toEqual({
      success: false,
      error: "There is already a brand called “MR. KING”.",
    });
    expect(productUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses to rename Uncategorised", async () => {
    labelFindUnique.mockResolvedValue({
      id: "lbl-9",
      kind: "CATEGORY",
      value: "Uncategorised",
    });

    const result = await renameLabel({ id: "lbl-9", value: "Misc" });

    expect(result.success).toBe(false);
    expect(productUpdateMany).not.toHaveBeenCalled();
  });
});

describe("removeLabel", () => {
  it("refuses while products still carry the value", async () => {
    labelFindUnique.mockResolvedValue({ id: "lbl-1", kind: "BRAND", value: "AARA" });
    productCount.mockResolvedValue(3);

    const result = await removeLabel("lbl-1");

    expect(result).toEqual({
      success: false,
      error:
        "3 products still use “AARA”. Change them first, or rename this value instead.",
    });
    expect(labelDelete).not.toHaveBeenCalled();
  });

  it("deletes a value nothing uses", async () => {
    labelFindUnique.mockResolvedValue({ id: "lbl-1", kind: "BRAND", value: "AARA" });

    const result = await removeLabel("lbl-1");

    expect(result.success).toBe(true);
    expect(labelDelete).toHaveBeenCalledWith({ where: { id: "lbl-1" } });
  });

  it("refuses to remove Uncategorised, whatever its count", async () => {
    // `resolveProducts` writes this value for a document that names no
    // category, and a product must have one — so it has to stay.
    labelFindUnique.mockResolvedValue({
      id: "lbl-9",
      kind: "CATEGORY",
      value: "Uncategorised",
    });

    const result = await removeLabel("lbl-9");

    expect(result.success).toBe(false);
    expect(labelDelete).not.toHaveBeenCalled();
  });
});

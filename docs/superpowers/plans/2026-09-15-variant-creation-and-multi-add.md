# Phase 39 — Variant creation and multi-add: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One screen creates a product and all of its variants in one submit,
bound to one `ProductFamily`; the shop product page takes a carton count per
variant and adds them in one action.

**Architecture:** No migration. A variant stays a `Product` row of its own, as
it has since Phase 31; `ProductFamily` (Phase 36) is what binds a set. Three
server-side additions — a batch validation schema, a batch create action, and
an R2 `CopyObject` so one photo set serves every variant — and two UI changes,
one per audience.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind
v4 (`@theme` tokens only), Prisma 7 on Neon, Zod 4, Vitest, R2 via AWS SDK v3.

**Spec:** `docs/specs/39-variant-creation-and-multi-add.md`

## Global Constraints

- **No migration in this phase.** If a task seems to need a schema change, stop
  and report — it means the plan is wrong, not the schema.
- **Design system is mandatory.** No raw hex, no px font size, no arbitrary
  Tailwind value. Tokens live in `src/app/globals.css` under `@theme`. Read
  `context/design-system.md` before touching any component.
- **Sentence-case labels.** "Add variant", not "Add Variant".
- **Every product write is `requireSuperAdmin()`.** Unchanged by this phase.
- **No `any`.** Strict TypeScript; `unknown` plus narrowing where needed.
- **Return `{ success, data, error }` from every Server Action**, errors
  surfaced by toast, per `context/coding-standard.md`.
- **Ask before committing** is the project rule for the *user's* workflow; a
  task's own commit step is pre-authorised by the user approving this plan.
- **Never write "Generated with Claude" in a commit message.** End each with
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Run the full suite before each commit:** `npx vitest run`, then
  `npx tsc --noEmit`, then `npm run lint`. Lint has **2 pre-existing warnings
  and 0 errors** — that is the baseline, not a regression to fix.
- **Branch:** `feature/variant-creation`, already created, stacked on
  `feature/order-confirmation`.

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/lib/validation/product-variants.ts` | `productVariantsSchema` — the shared half of a product plus one-to-24 variant rows, with the in-batch duplicate-SKU and family-at-two rules. Pure. |
| `src/lib/validation/product-variants.test.ts` | Its tests. |
| `src/components/products/VariantRows.tsx` | The create form's Variants table: a row per variant with label, SKU, price and its own image disclosure. Presentational; all state lives in `ProductForm`. |
| `src/components/shop/VariantBuyRows.tsx` | The buy box's per-variant quantity rows and their footer total. Client, `useState` only. |

**Modified**

| File | Change |
|---|---|
| `src/lib/validation/products.ts` | Extract the raw object as `productObject` before its `.refine()`, and export `growingLabel`, `decimalString`, `FAMILY_XOR_MESSAGE` so the batch schema reuses them instead of re-declaring them. |
| `src/lib/r2.ts` | `copyObject(fromKey, toKey)` and `extensionOfKey(key)`. |
| `src/actions/products.ts` | `createProductVariants`, `copyImagesToVariants`. |
| `src/actions/products.test.ts` | Tests for both. |
| `src/components/products/ProductForm.tsx` | Shared fields above, variant rows below; the three per-variant fields move into the table at two rows; submit calls the batch action then uploads and copies images. |
| `src/lib/validation/cart.ts` | `addManyToCartSchema`. |
| `src/lib/guest-cart.ts` | `addLines(cart, lines)`. |
| `src/lib/guest-cart.test.ts` | Its tests. |
| `src/components/shop/GuestCartProvider.tsx` | `addMany` on the context API. |
| `src/actions/cart.ts` | `addManyToCart`. |
| `src/actions/cart.test.ts` | Its tests. |
| `src/lib/queries/shop-catalogue.ts` | `ShopVariant` gains `packSize` and `unit`; `VARIANT_SELECT` gains `unit`. |
| `src/components/shop/BuyBox.tsx` | Takes `variants`; renders today's single stepper at one variant and `VariantBuyRows` at two or more. |
| `src/app/(storefront)/shop/products/[id]/page.tsx` | Passes the variants it already loads into `BuyBox`. |
| `context/current-feature.md` | Phase 39 recorded as the current feature, Phase 38 demoted to previous. |

---

### Task 1: The batch validation schema

**Files:**
- Modify: `src/lib/validation/products.ts`
- Create: `src/lib/validation/product-variants.ts`
- Test: `src/lib/validation/product-variants.test.ts`

**Interfaces:**
- Consumes: `skuSchema` (exists), `productSchema`'s field definitions.
- Produces:
  - `productObject: z.ZodObject<…>` — the unrefined shape, exported from `products.ts`
  - `growingLabel(limit: number)`, `decimalString`, `FAMILY_XOR_MESSAGE: string` — exported from `products.ts`
  - `MAX_VARIANT_ROWS = 24`
  - `productVariantsSchema`
  - `type ProductVariantsInput = z.input<typeof productVariantsSchema>`
  - `type ProductVariantsParsed = z.output<typeof productVariantsSchema>`
  - A parsed value's shape: every field of `ProductParsed` except `sku`, `listPrice` and `variant`, plus `variants: { variant: string | null; sku: string; listPrice: string }[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/validation/product-variants.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_VARIANT_ROWS,
  productVariantsSchema,
  type ProductVariantsInput,
} from "@/lib/validation/product-variants";

/** The shared half of a submit. Variants are added per test. */
const shared: Omit<ProductVariantsInput, "variants"> = {
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

const row = (variant: string, sku: string, listPrice = "189.00") => ({
  variant,
  sku,
  listPrice,
});

/** The first issue's message, which is what the action reports. */
const failure = (input: ProductVariantsInput) => {
  const result = productVariantsSchema.safeParse(input);
  if (result.success) throw new Error("expected the parse to fail");
  return result.error.issues[0]?.message;
};

describe("productVariantsSchema", () => {
  it("accepts one variant with no family, like the form does today", () => {
    const result = productVariantsSchema.safeParse({
      ...shared,
      variants: [row("Goat's Milk", "ZEN-SC-2100-GM-VN")],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.variants).toHaveLength(1);
    expect(result.data.variants[0]?.variant).toBe("Goat's Milk");
  });

  it("carries the shared fields through untouched", () => {
    const result = productVariantsSchema.safeParse({
      ...shared,
      variants: [row("Papaya", "ZEN-SC-2100-PP-VN")],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.name).toBe("Zen Garden Shower Cream 2.1L");
    expect(result.data.packSize).toBe(6);
    expect(result.data.cartonsPerPallet).toBe(60);
    expect(result.data.market).toBe("Vietnam");
  });

  it("refuses a second variant with no family", () => {
    expect(
      failure({
        ...shared,
        variants: [
          row("Papaya", "ZEN-SC-2100-PP-VN"),
          row("Lavender", "ZEN-SC-2100-LV-VN"),
        ],
      }),
    ).toBe(
      "Two or more variants need a family, so the shop shows them as one product.",
    );
  });

  it("accepts a second variant against an existing family", () => {
    const result = productVariantsSchema.safeParse({
      ...shared,
      familyId: "fam-1",
      variants: [
        row("Papaya", "ZEN-SC-2100-PP-VN"),
        row("Lavender", "ZEN-SC-2100-LV-VN"),
      ],
    });
    expect(result.success).toBe(true);
  });

  it("names the SKU two rows share", () => {
    expect(
      failure({
        ...shared,
        familyId: "fam-1",
        variants: [
          row("Papaya", "ZEN-SC-2100-PP"),
          row("Lavender", "ZEN-SC-2100-PP"),
        ],
      }),
    ).toBe("Two variants carry the SKU ZEN-SC-2100-PP. Every variant needs its own.");
  });

  it("catches a duplicate that only normalisation reveals", () => {
    // skuSchema upper-cases and collapses whitespace, so these are one code.
    expect(
      failure({
        ...shared,
        familyId: "fam-1",
        variants: [
          row("Papaya", "zen-sc-2100-pp"),
          row("Lavender", "ZEN-SC-2100-PP"),
        ],
      }),
    ).toBe("Two variants carry the SKU ZEN-SC-2100-PP. Every variant needs its own.");
  });

  it("validates each variant's own price", () => {
    expect(
      failure({
        ...shared,
        variants: [row("Papaya", "ZEN-SC-2100-PP-VN", "0")],
      }),
    ).toBe("The list price must be a number above zero");
  });

  it("refuses an empty variants array", () => {
    expect(failure({ ...shared, variants: [] })).toBe("Add at least one variant");
  });

  it(`refuses more than ${MAX_VARIANT_ROWS} variants`, () => {
    const variants = Array.from({ length: MAX_VARIANT_ROWS + 1 }, (_, index) =>
      row(`Flavour ${index}`, `ZEN-SC-2100-F${index}`),
    );
    expect(failure({ ...shared, familyId: "fam-1", variants })).toBe(
      `Use at most ${MAX_VARIANT_ROWS} variants at a time`,
    );
  });

  it("still refuses a family picked and described at once", () => {
    expect(
      failure({
        ...shared,
        familyId: "fam-1",
        newFamily: {
          code: "ZEN-SC-2100",
          name: "Zen Garden Shower Cream 2.1L",
          brand: "ZEN GARDEN",
          category: "Shower cream & gel",
          size: "2.1L",
        },
        variants: [row("Papaya", "ZEN-SC-2100-PP-VN")],
      }),
    ).toBe("Choose an existing family or describe a new one, not both");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/validation/product-variants.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/validation/product-variants"`.

- [ ] **Step 3: Export the reusable pieces from `products.ts`**

In `src/lib/validation/products.ts`, change the two private declarations to
exports and split the object from its refinement. `growingLabel` and
`decimalString` keep their existing bodies and doc comments exactly; only the
`export` keyword is added.

```ts
// was: const decimalString = …
export const decimalString = z
```

```ts
// was: const growingLabel = (limit: number) =>
export const growingLabel = (limit: number) =>
```

Then replace the `export const productSchema = z.object({…}).refine(…)`
declaration's opening and closing so the shape is reusable:

```ts
/**
 * The shape without its cross-field rule, so a caller that needs a different
 * arrangement of the same fields can `omit` and `extend` it — Phase 39's batch
 * create keeps the shared half and moves `sku`, `listPrice` and `variant` into
 * a per-variant row. Refinements do not survive `omit`, so the rule below is
 * restated there rather than inherited.
 */
export const productObject = z.object({
  // …every existing field, unchanged…
});

export const FAMILY_XOR_MESSAGE =
  "Choose an existing family or describe a new one, not both";

export const productSchema = productObject.refine(
  (value) => !(value.familyId && value.newFamily),
  { message: FAMILY_XOR_MESSAGE, path: ["familyId"] },
);
```

Do **not** change any field definition inside the object, and do not reorder
them — `productSchema`'s behaviour must be identical afterwards.

- [ ] **Step 4: Write the batch schema**

Create `src/lib/validation/product-variants.ts`:

```ts
import { z } from "zod";
import {
  FAMILY_XOR_MESSAGE,
  decimalString,
  growingLabel,
  productObject,
  skuSchema,
} from "@/lib/validation/products";

/**
 * Creating a product and all of its flavours in one submit (Phase 39).
 *
 * A variant is a `Product` row of its own, as it has been since Phase 31, so
 * this schema is `productSchema`'s shared half plus a row per variant carrying
 * the three things that genuinely differ: the flavour, its code and its price.
 * Everything else — brand, category, pack size, cartons per pallet, unit,
 * market, description, family, active — is entered once and applied to every
 * row, which is also what keeps them in one group: `groupKey` keys on family,
 * pack size and market, so variants that disagree on those would draw separate
 * cards.
 *
 * Two rules beyond the field-level ones:
 *
 * - **a SKU repeated inside the batch is named**, because Postgres would answer
 *   the same collision with a P2002 that cannot say which pair collided. The
 *   check runs on the *parsed* codes, so two spellings of one code
 *   (`zen-sc-2100-pp` and `ZEN-SC-2100-PP`) are caught — `skuSchema`
 *   upper-cases and collapses whitespace before this sees them;
 * - **two or more variants require a family.** With one row a family stays
 *   optional, exactly as it is today. With two, the family is what guarantees
 *   the shop draws one card instead of relying on `groupKey`'s derived
 *   brand-and-name fallback matching two hand-typed names.
 *
 * The refinements are declared in the order their messages should win, because
 * the action reports `issues[0]` alone.
 */
export const MAX_VARIANT_ROWS = 24;

export const variantRowSchema = z.object({
  /** Goat's Milk, Lavender, Papaya — null for a product with no flavour. */
  variant: growingLabel(40),
  sku: skuSchema,
  listPrice: decimalString,
});

export const productVariantsSchema = productObject
  .omit({ sku: true, listPrice: true, variant: true })
  .extend({
    variants: z
      .array(variantRowSchema)
      .min(1, "Add at least one variant")
      .max(MAX_VARIANT_ROWS, `Use at most ${MAX_VARIANT_ROWS} variants at a time`),
  })
  .refine((value) => !(value.familyId && value.newFamily), {
    message: FAMILY_XOR_MESSAGE,
    path: ["familyId"],
  })
  .refine(
    (value) => value.variants.length < 2 || Boolean(value.familyId || value.newFamily),
    {
      message:
        "Two or more variants need a family, so the shop shows them as one product.",
      path: ["familyId"],
    },
  )
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [index, variant] of value.variants.entries()) {
      if (seen.has(variant.sku)) {
        ctx.addIssue({
          code: "custom",
          message: `Two variants carry the SKU ${variant.sku}. Every variant needs its own.`,
          path: ["variants", index, "sku"],
        });
        continue;
      }
      seen.add(variant.sku);
    }
  });

export type ProductVariantsInput = z.input<typeof productVariantsSchema>;
export type ProductVariantsParsed = z.output<typeof productVariantsSchema>;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/validation/product-variants.test.ts src/lib/validation/products.test.ts`
Expected: PASS — the new file's 10 tests, and every existing `products.test.ts`
test still passing (the `productObject` split must be behaviour-preserving).

If the duplicate-SKU test reports the family message instead, the refinement
order is wrong: the family rule must be declared before the `superRefine`, and
the test payload carries `familyId: "fam-1"` so only one rule can fire.

- [ ] **Step 6: Run the full suite and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all tests pass, no type errors, 2 warnings / 0 errors from lint.

```bash
git add src/lib/validation/products.ts src/lib/validation/product-variants.ts src/lib/validation/product-variants.test.ts
git commit -m "$(cat <<'MSG'
feat(products): a schema for creating a product's variants in one submit

productSchema's shape becomes productObject so the batch can keep its shared
half and move sku, listPrice and variant into a per-variant row. Two rules
beyond the fields: a SKU repeated inside the batch is named rather than left
to Postgres, and two or more variants require a family so the shop draws one
card rather than relying on the derived grouping key.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: The batch create action

**Files:**
- Modify: `src/actions/products.ts`
- Test: `src/actions/products.test.ts`

**Interfaces:**
- Consumes: `productVariantsSchema`, `ProductVariantsInput` (Task 1); the
  existing module-private `guard`, `duplicate`, `duplicateMessage`,
  `revalidate`, and `registerLabels` from `@/lib/catalog-label-registry`.
- Produces:
  ```ts
  export async function createProductVariants(
    input: ProductVariantsInput,
  ): Promise<ActionResult<{ familyId: string | null; variants: { id: string; sku: string }[] }>>
  ```
  `variants` is returned **in submitted row order**, which Task 4 relies on to
  match staged images to the rows that own them.

- [ ] **Step 1: Write the failing tests**

Append to `src/actions/products.test.ts`. The existing mocks already cover
`product.create`, `productPrice.create`, `catalogLabel.*` and
`productFamily.create` on `tx`; add the import and the block.

Change the existing import line to include the new action:

```ts
const {
  createProduct,
  createProductVariants,
  deleteProduct,
  setProductPublished,
  updateProduct,
} = await import("@/actions/products");
```

Then append:

```ts
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
    // Phase 28's registry is called per variant, with that variant's flavour.
    expect(labelFindFirst).toHaveBeenCalled();
    expect(labelFindFirst.mock.calls.length).toBeGreaterThanOrEqual(3);
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
```

`Prisma` is already imported at the top of that file
(`const { Prisma } = await import("@/generated/prisma/client")`). If the
existing file does not import it, add that line beside the action import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/actions/products.test.ts`
Expected: FAIL — `createProductVariants is not a function`.

- [ ] **Step 3: Write the action**

In `src/actions/products.ts`, add the import and the action immediately after
`createProduct`:

```ts
import {
  productVariantsSchema,
  type ProductVariantsInput,
} from "@/lib/validation/product-variants";
```

```ts
/**
 * A product and every flavour of it, in one submit and one transaction
 * (Phase 39).
 *
 * Not a loop over `createProduct`: eight separate calls means eight
 * transactions, so a duplicate SKU on the seventh leaves six products and a
 * family behind — a half-entered catalogue nobody asked for and nobody can see
 * is half-entered. Here the family is created once and every row, its first
 * price and its labels commit together or not at all.
 *
 * The ids come back in submitted row order, because the caller has staged
 * images per row and nothing else could tell it which product owns which.
 */
export async function createProductVariants(
  input: ProductVariantsInput,
): Promise<
  ActionResult<{ familyId: string | null; variants: { id: string; sku: string }[] }>
> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = productVariantsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Those variants could not be saved.",
    };
  }
  const data = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const familyId = data.newFamily
        ? (await tx.productFamily.create({ data: data.newFamily, select: { id: true } })).id
        : data.familyId;

      const variants: { id: string; sku: string }[] = [];
      for (const row of data.variants) {
        const created = await tx.product.create({
          data: {
            name: data.name,
            sku: row.sku,
            familyId,
            category: data.category,
            unit: data.unit,
            brand: data.brand,
            variant: row.variant,
            packSize: data.packSize,
            cartonsPerPallet: data.cartonsPerPallet,
            market: data.market,
            listPrice: new Prisma.Decimal(row.listPrice),
            description: data.description,
            active: data.active,
          },
          select: { id: true, sku: true },
        });
        // The first price is history too, exactly as in `createProduct`:
        // without it a variant's trend has no origin.
        await tx.productPrice.create({
          data: {
            productId: created.id,
            price: new Prisma.Decimal(row.listPrice),
            setById: user.id,
          },
        });
        await registerLabels(tx, {
          brand: data.brand,
          variant: row.variant,
          market: data.market,
          category: data.category,
        });
        variants.push(created);
      }

      return { familyId: familyId ?? null, variants };
    });

    revalidate();
    return { success: true, data: result };
  } catch (cause) {
    if (duplicate(cause)) {
      return { success: false, error: duplicateMessage(cause) };
    }
    console.error("[products] createProductVariants", cause);
    return { success: false, error: "We couldn't save those variants." };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/actions/products.test.ts`
Expected: PASS — the 10 new tests plus every existing one.

- [ ] **Step 5: Watch one test catch its own removal**

Delete the `await registerLabels(…)` call from `createProductVariants`, run
`npx vitest run src/actions/products.test.ts -t "registers each variant"`, and
confirm it **fails**. Restore the call and confirm it passes. `git diff
src/actions/products.ts` must show the call back in place before committing.

- [ ] **Step 6: Run the full suite and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`

```bash
git add src/actions/products.ts src/actions/products.test.ts
git commit -m "$(cat <<'MSG'
feat(products): create a product and all of its variants in one transaction

One family, then a row, its first price and its labels per variant, all inside
one transaction — so a duplicate SKU on the seventh variant leaves nothing
behind rather than six products and a family. The ids come back in row order,
which is the only thing that can tell the caller which product owns which
staged image.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: One photo set, copied to the siblings

**Files:**
- Modify: `src/lib/r2.ts`
- Modify: `src/actions/products.ts`
- Test: `src/actions/products.test.ts`

**Interfaces:**
- Consumes: `productImageKey`, `productThumbKey`, `PENDING_KEY_PREFIX` (exist).
- Produces:
  ```ts
  // src/lib/r2.ts
  export function copyObject(fromKey: string, toKey: string): Promise<CopyObjectCommandOutput>
  export function extensionOfKey(key: string): string   // "jpg" for products/a/b.jpg

  // src/actions/products.ts
  export async function copyImagesToVariants(
    sourceProductId: string,
    targetProductIds: string[],
  ): Promise<ActionResult<{ copied: number; failed: number }>>
  ```

- [ ] **Step 1: Write the failing tests**

In `src/actions/products.test.ts`, widen the `@/lib/r2` mock and the prisma
mock, then add the block.

Replace the existing r2 mock. The key builders are pure and the assertions
below are about the keys, so the **real** ones are used — a mock re-implementing
`productImageKey` would let the two drift and the test would still pass. That
means importing the real module, which builds an `S3Client` at import time from
`env`, so `@/lib/env` has to be mocked too. `src/lib/r2.test.ts` already does
exactly this; copy its env block rather than inventing another.

```ts
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
```

If `products.test.ts` already mocks `@/lib/env`, extend that mock with the four
R2 keys instead of adding a second `vi.mock` for the same module.

Add to the prisma mock's object (inside the existing `vi.mock("@/lib/prisma", …)`):

```ts
    productImage: {
      findMany: imageFindMany,
      count: imageCount,
      create: imageCreate,
      update: imageUpdate,
      delete: imageDelete,
    },
```

and declare the four spies beside the others at the top:

```ts
const imageFindMany = vi.fn();
const imageCount = vi.fn();
const imageCreate = vi.fn();
const imageUpdate = vi.fn();
const imageDelete = vi.fn();
```

Add `copyImagesToVariants` to the action import, then append:

```ts
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

    expect(result).toEqual({ success: true, data: { copied: 4, failed: 0 } });
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

  it("deletes the row when a copy fails, so no unloadable tile is left", async () => {
    copyObject.mockRejectedValueOnce(new Error("R2 said no"));
    imageDelete.mockResolvedValue({});

    const result = await copyImagesToVariants("prd-1", ["prd-2"]);

    expect(result).toEqual({ success: true, data: { copied: 1, failed: 1 } });
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
    expect(result).toEqual({ success: true, data: { copied: 0, failed: 0 } });
    expect(imageFindMany).not.toHaveBeenCalled();
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/actions/products.test.ts`
Expected: FAIL — `copyImagesToVariants is not a function`.

- [ ] **Step 3: Add `copyObject` and `extensionOfKey` to r2.ts, with tests**

First append to `src/lib/r2.test.ts`, adding `extensionOfKey` to its import:

```ts
describe("extensionOfKey", () => {
  it("reads the extension off an image key", () => {
    expect(extensionOfKey("products/prd-1/img-a.jpg")).toBe("jpg");
  });

  it("lower-cases it, so a copy cannot fork the key on casing", () => {
    expect(extensionOfKey("products/prd-1/img-a.JPEG")).toBe("jpeg");
  });

  it("reads the last extension, not the first", () => {
    expect(extensionOfKey("products/prd-1/img-a.1600.webp")).toBe("webp");
  });

  it("falls back to jpg where there is no extension at all", () => {
    expect(extensionOfKey("products/prd-1/img-a")).toBe("jpg");
  });

  it("is not fooled by a dot in a folder name", () => {
    expect(extensionOfKey("products/v1.2/img-a")).toBe("jpg");
  });
});
```

Run `npx vitest run src/lib/r2.test.ts` and watch these five fail, then

Add `CopyObjectCommand` to the existing `@aws-sdk/client-s3` import at the top
of `src/lib/r2.ts`, then add both functions immediately after `putObject`:

```ts
/**
 * Server-side copy, so one uploaded photograph can serve every variant of a
 * product without the browser sending the bytes again (Phase 39). Eight
 * flavours of a 5 MB photograph is 40 MB up a phone's connection; this is one
 * upload and seven copies inside the bucket.
 *
 * `CopySource` is `{bucket}/{key}` and S3 requires it URI-encoded — the keys
 * this app writes are cuid-based and hold nothing that needs escaping, so
 * `encodeURI` is a no-op today and correct if that ever changes.
 */
export function copyObject(fromKey: string, toKey: string) {
  return r2.send(
    new CopyObjectCommand({
      Bucket: env.R2_BUCKET,
      CopySource: encodeURI(`${env.R2_BUCKET}/${fromKey}`),
      Key: toKey,
    }),
  );
}

/** `jpg` from `products/{productId}/{imageId}.jpg`; `jpg` as the fallback. */
export function extensionOfKey(key: string): string {
  const last = key.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : "jpg";
}
```

- [ ] **Step 4: Write the action**

In `src/actions/products.ts`, add to the imports:

```ts
import { randomUUID } from "node:crypto";
import {
  PENDING_KEY_PREFIX,
  copyObject,
  deleteObject,
  extensionOfKey,
  productImageKey,
  productThumbKey,
} from "@/lib/r2";
```

(`deleteObject` is already imported; merge rather than duplicating the line.)

Add the action after `createProductVariants`:

```ts
/**
 * Gives a set of variants the photographs of one of their siblings
 * (Phase 39).
 *
 * Phase 27's rule is that a product cannot exist without a picture, and a set
 * of eight flavours usually has one photograph of the range rather than eight.
 * The bytes are uploaded once, through the ordinary presign → PUT → complete
 * route — which is what runs sharp and writes the 1600px derivative — and this
 * copies both objects of every processed image to each sibling's own key.
 *
 * Deliberately not transactional. A copy is an R2 call, not a database write,
 * and a failed one must not roll back the images that did land: a variant with
 * one of two photographs is a product somebody can fix from
 * `ProductImageManager`, while a rollback would leave it with none and no
 * record of what was attempted. What each failure *does* undo is its own row,
 * because a `ProductImage` whose `r2Key` is still the placeholder renders a
 * tile nobody can load and nobody can remove.
 */
export async function copyImagesToVariants(
  sourceProductId: string,
  targetProductIds: string[],
): Promise<ActionResult<{ copied: number; failed: number }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };
  if (targetProductIds.length === 0) {
    return { success: true, data: { copied: 0, failed: 0 } };
  }

  // `thumbKey: { not: null }` is what "processed" means: a row whose upload
  // never completed has no derivative, and copying its original alone would
  // give the sibling a tile every screen reads through the derivative.
  const images = await prisma.productImage.findMany({
    where: { productId: sourceProductId, thumbKey: { not: null } },
    orderBy: { position: "asc" },
    select: { r2Key: true, thumbKey: true, sizeBytes: true, position: true },
  });
  if (images.length === 0) {
    return {
      success: false,
      error: "That product has no processed images to copy.",
    };
  }

  let copied = 0;
  let failed = 0;

  for (const targetId of targetProductIds) {
    // Offset past anything the target already carries: `ProductImage` has
    // `@@unique([productId, position])`, so reusing the source's positions
    // would throw on a variant that staged its own pictures.
    const taken = await prisma.productImage.count({ where: { productId: targetId } });

    for (const [index, image] of images.entries()) {
      let rowId: string | null = null;
      try {
        const row = await prisma.productImage.create({
          data: {
            productId: targetId,
            r2Key: `${PENDING_KEY_PREFIX}${randomUUID()}`,
            position: taken + index,
            sizeBytes: image.sizeBytes,
          },
          select: { id: true },
        });
        rowId = row.id;

        const r2Key = productImageKey(targetId, row.id, extensionOfKey(image.r2Key));
        const thumbKey = productThumbKey(targetId, row.id);
        await copyObject(image.r2Key, r2Key);
        await copyObject(image.thumbKey!, thumbKey);
        await prisma.productImage.update({
          where: { id: row.id },
          data: { r2Key, thumbKey },
        });
        copied += 1;
      } catch (cause) {
        console.error("[products] copyImagesToVariants", cause);
        failed += 1;
        if (rowId) {
          await prisma.productImage
            .delete({ where: { id: rowId } })
            .catch(() => undefined);
        }
      }
    }
  }

  revalidate();
  return { success: true, data: { copied, failed } };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/actions/products.test.ts`
Expected: PASS — the 8 new tests plus everything already there.

- [ ] **Step 6: Run the full suite and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`

```bash
git add src/lib/r2.ts src/actions/products.ts src/actions/products.test.ts
git commit -m "$(cat <<'MSG'
feat(products): copy one variant's photographs to its siblings inside R2

Eight flavours of a 5 MB photograph is 40 MB up a phone's connection. The
bytes are uploaded once through the ordinary presign route, so sharp still
writes the derivative, and CopyObject gives each sibling its own keys. Not
transactional on purpose: a failed copy undoes its own row, because a
ProductImage still holding the placeholder key renders a tile nobody can load,
but it must not roll back the images that did land.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: The create screen

**Files:**
- Create: `src/components/products/VariantRows.tsx`
- Modify: `src/components/products/ProductForm.tsx`

**Interfaces:**
- Consumes: `createProductVariants`, `copyImagesToVariants` (Tasks 2–3);
  `useImageUploadQueue`'s `add(productId, files, existingCount) => Promise<{uploaded, failed}>`;
  `generateVariantSku(familyCode, { variant, market })`, `generateSku`,
  `sizeInName`; `StagedImages`, `GrowingListPicker`, `FamilyPicker`.
- Produces:
  ```ts
  // src/components/products/VariantRows.tsx
  export type VariantRowState = {
    key: string;                 // local only; React key and image ownership
    variant: string | null;
    sku: string;
    skuTouched: boolean;
    listPrice: string;
    staged: (StagedImage & { file: File })[];
  };

  export function VariantRows(props: {
    rows: VariantRowState[];
    knownVariants: string[];
    suggestedSku: (row: VariantRowState) => string;
    busy: boolean;
    rejected: Record<string, { name: string; reason: string }[]>;
    onPatch: (key: string, patch: Partial<VariantRowState>) => void;
    onRemove: (key: string) => void;
    onFiles: (key: string, files: File[]) => void;
    onMoveImage: (key: string, index: number, delta: number) => void;
    onRemoveImage: (key: string, index: number) => void;
  }): React.JSX.Element
  ```

There is no component test harness in this repo (one `.test.tsx` in total), so
this task's gate is types, lint, build and the browser pass in Task 7. Write it
to be measurable there.

- [ ] **Step 1: Write `VariantRows.tsx`**

```tsx
"use client";

import { X } from "lucide-react";
import { GrowingListPicker } from "@/components/products/GrowingListPicker";
import { StagedImages, type StagedImage } from "@/components/products/StagedImages";
import { Input } from "@/components/ui/input";

/** One row of the create form's Variants section. Local state only: `key` is
 *  a React key and the handle staged images are filed under, and never leaves
 *  the browser — the submit maps a row to `{ variant, sku, listPrice }`. */
export type VariantRowState = {
  key: string;
  variant: string | null;
  sku: string;
  /** Set on the first keystroke in this row's SKU field; the row stops
   *  following the proposal from then on, and only this row. */
  skuTouched: boolean;
  listPrice: string;
  staged: (StagedImage & { file: File })[];
};

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

/**
 * A row per flavour on the create screen (Phase 39).
 *
 * Rendered only when there are two or more of them. With one variant its three
 * fields live in the details card above, where they have always been, so a
 * single-product create is the screen that existed before this phase — the
 * fields move rather than appearing twice.
 *
 * A card per row rather than a `<table>`: the row holds a combobox that opens
 * downward, and a table cell is the wrong container for that. The stacked card
 * is also what 390px needs, so there is one layout instead of two.
 *
 * Live upload progress is deliberately absent here. There is one upload queue
 * for the whole submit and it renders in the shared Images panel; a row's
 * disclosure shows what is staged and what was refused, which is what a reader
 * needs while filling the form in.
 */
export function VariantRows({
  rows,
  knownVariants,
  suggestedSku,
  busy,
  rejected,
  onPatch,
  onRemove,
  onFiles,
  onMoveImage,
  onRemoveImage,
}: {
  rows: VariantRowState[];
  knownVariants: string[];
  suggestedSku: (row: VariantRowState) => string;
  busy: boolean;
  /** Refusals from this row's own dropzone, keyed by row. */
  rejected: Record<string, { name: string; reason: string }[]>;
  onPatch: (key: string, patch: Partial<VariantRowState>) => void;
  onRemove: (key: string) => void;
  onFiles: (key: string, files: File[]) => void;
  onMoveImage: (key: string, index: number, delta: number) => void;
  onRemoveImage: (key: string, index: number) => void;
}) {
  return (
    // `disabled` on the fieldset, so every control inside is locked while the
    // submit is in flight without each one needing to know about it.
    <fieldset className="mt-md flex flex-col gap-sm" disabled={busy}>
      <legend className="sr-only">Variants</legend>

      {rows.map((row, index) => {
        const name = row.variant?.trim() || `Variant ${index + 1}`;

        return (
          <div key={row.key} className="rounded-lg border border-hairline p-md">
            <div className="flex items-start justify-between gap-sm">
              <p className="text-[length:var(--text-body-sm)] font-semibold text-ink">
                {name}
              </p>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                title={`Remove ${name}`}
                onClick={() => onRemove(row.key)}
                className="grid size-11 shrink-0 place-items-center rounded-sm text-ink-secondary hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:text-ink-disabled sm:size-9"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <div className="mt-sm grid gap-sm sm:grid-cols-[2fr_2fr_1fr]">
              <div className="flex flex-col gap-xxs">
                <span className={label}>Variant</span>
                <GrowingListPicker
                  label="Variant"
                  value={row.variant}
                  known={knownVariants}
                  onChange={(variant) => onPatch(row.key, { variant })}
                />
              </div>

              <div className="flex flex-col gap-xxs">
                <label htmlFor={`variant-sku-${row.key}`} className={label}>
                  SKU
                </label>
                <Input
                  id={`variant-sku-${row.key}`}
                  value={row.skuTouched ? row.sku : suggestedSku(row)}
                  // Upper-cased as typed, like the single-product form's own
                  // SKU field: two spellings of one code must not both enter.
                  onChange={(event) =>
                    onPatch(row.key, {
                      skuTouched: true,
                      sku: event.target.value.toUpperCase(),
                    })
                  }
                />
              </div>

              <div className="flex flex-col gap-xxs">
                <label htmlFor={`variant-price-${row.key}`} className={label}>
                  List price
                </label>
                <Input
                  id={`variant-price-${row.key}`}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={row.listPrice}
                  onChange={(event) => onPatch(row.key, { listPrice: event.target.value })}
                  className="tabular-nums"
                />
              </div>
            </div>

            <details className="mt-sm">
              <summary className="flex h-11 cursor-pointer items-center text-[length:var(--text-body-sm)] text-brand-link">
                {row.staged.length > 0
                  ? `${row.staged.length} of its own ${row.staged.length === 1 ? "image" : "images"}`
                  : "Its own images"}
              </summary>
              <p className={`mt-xxs ${caption}`}>
                Uses the shared pictures unless you add some here.
              </p>
              <div className="mt-xs">
                <StagedImages
                  staged={row.staged}
                  rows={[]}
                  rejected={rejected[row.key] ?? []}
                  busy={busy}
                  onFiles={(files) => onFiles(row.key, files)}
                  onMove={(at, delta) => onMoveImage(row.key, at, delta)}
                  onRemove={(at) => onRemoveImage(row.key, at)}
                />
              </div>
            </details>
          </div>
        );
      })}
    </fieldset>
  );
}
```

Two things to check rather than assume, because they are this file's only
external contracts: `GrowingListPicker` takes exactly
`{ label, value, known, onChange, required? }` (as `ProductForm` calls it
today), and `StagedImages` takes exactly
`{ staged, rows, rejected, busy, onFiles, onMove, onRemove }`. If either has
moved, follow the real signature rather than this snippet.

- [ ] **Step 2: Move the three per-variant fields in `ProductForm.tsx`**

Replace the form's `ProductInput` state with the shared half plus rows:

```ts
type SharedInput = Omit<ProductVariantsInput, "variants">;

const BLANK: SharedInput = {
  name: "",
  category: PRODUCT_CATEGORIES[0],
  unit: "carton",
  brand: null,
  packSize: "",
  cartonsPerPallet: "",
  market: "Malaysia",
  description: null,
  active: true,
  familyId: null,
  newFamily: null,
};

const blankRow = (listPrice = ""): VariantRowState => ({
  key: crypto.randomUUID(),
  variant: null,
  sku: "",
  skuTouched: false,
  listPrice,
  staged: [],
});
```

```ts
const [form, setForm] = useState<SharedInput>(BLANK);
const [rows, setRows] = useState<VariantRowState[]>([blankRow()]);
const many = rows.length > 1;
```

The SKU proposal becomes per row, reusing the existing `familyCode`
computation unchanged:

```ts
/**
 * The code a row takes while nobody has typed one into it. Identical
 * arithmetic to the single-product form's — the family's code plus this
 * row's flavour and the shared market, falling back to brand, category and
 * the size in the name where there is no family.
 */
const suggestedSku = (row: VariantRowState) =>
  familyCode
    ? generateVariantSku(familyCode, { variant: row.variant, market: form.market ?? null })
    : generateSku({
        brand: form.brand ?? null,
        category: form.category,
        size: sizeInName(form.name),
        variant: row.variant,
        market: form.market ?? null,
      });

const skuOf = (row: VariantRowState) => (row.skuTouched ? row.sku : suggestedSku(row));
```

**The moving fields.** In the details card, the Variant picker, the SKU field
and the headline List price field each render only while `!many`, bound to
`rows[0]`. At two or more rows each is replaced by a caption in the same slot:

- under Variant: "One per variant, below"
- under SKU: "One per variant, below"
- in the price slot: "Priced per variant below"

Row 0's typed values are untouched by the move, so adding a second variant
never loses what was entered. Add this comment above the first of the three:

```tsx
{/* The three fields that differ per variant live here while there is one of
    them — so a single-variant create is the screen that existed before
    Phase 39 — and move into the Variants table the moment a second row is
    added. Never both: a value editable in two places is a value that can
    disagree with itself. */}
```

Then, as the details card's last block:

```tsx
<div className="mt-lg border-t border-hairline pt-lg">
  <div className="flex items-baseline justify-between gap-sm">
    <h2 className="text-[length:var(--text-heading-sm)] font-[650] text-ink">
      Variants
    </h2>
    <span className="text-[length:var(--text-caption)] text-ink-tertiary">
      {rows.length} {rows.length === 1 ? "variant" : "variants"}
    </span>
  </div>

  {many ? (
    <VariantRows
      rows={rows}
      knownVariants={labels.variant}
      suggestedSku={suggestedSku}
      busy={busy}
      rejected={rowRejected}
      onPatch={patchRow}
      onRemove={removeRow}
      onFiles={addRowFiles}
      onMoveImage={moveRowImage}
      onRemoveImage={removeRowImage}
    />
  ) : null}

  <Button
    type="button"
    variant="outline"
    disabled={busy || rows.length >= MAX_VARIANT_ROWS}
    onClick={addRow}
    className="mt-md"
  >
    + Add variant
  </Button>
  <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
    {rows.length >= MAX_VARIANT_ROWS
      ? `${MAX_VARIANT_ROWS} is the most in one go`
      : "Another flavour of the same product — it shares everything above"}
  </p>
</div>
```

with the row handlers:

```ts
const patchRow = (key: string, patch: Partial<VariantRowState>) =>
  setRows((current) =>
    current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
  );

/** A new row inherits the price above it: a range is usually priced alike. */
const addRow = () =>
  setRows((current) => [...current, blankRow(current.at(-1)?.listPrice ?? "")]);

const removeRow = (key: string) =>
  setRows((current) => {
    if (current.length === 1) return current;
    const going = current.find((row) => row.key === key);
    for (const image of going?.staged ?? []) URL.revokeObjectURL(image.url);
    return current.filter((row) => row.key !== key);
  });
```

`addRowFiles`, `moveRowImage` and `removeRowImage` reuse the existing
`addFiles` arithmetic: extract its per-file loop into a local
`acceptFiles(files, alreadyStaged)` returning `{ accepted, refused }`, and call
it from both the shared dropzone and each row, so one rejection rule serves
both. A row's refusals go into their own state keyed by row, which is what
`VariantRows` renders beside that row's dropzone:

```ts
const [rowRejected, setRowRejected] = useState<
  Record<string, { name: string; reason: string }[]>
>({});

const addRowFiles = (key: string, files: File[]) => {
  const row = rows.find((candidate) => candidate.key === key);
  if (!row) return;
  const { accepted, refused } = acceptFiles(files, row.staged.length);
  if (accepted.length > 0) patchRow(key, { staged: [...row.staged, ...accepted] });
  setRowRejected((current) => ({ ...current, [key]: refused }));
};

const moveRowImage = (key: string, index: number, delta: number) =>
  setRows((current) =>
    current.map((row) => {
      if (row.key !== key) return row;
      const next = [...row.staged];
      const to = index + delta;
      if (to < 0 || to >= next.length) return row;
      [next[index], next[to]] = [next[to]!, next[index]!];
      return { ...row, staged: next };
    }),
  );

const removeRowImage = (key: string, index: number) =>
  setRows((current) =>
    current.map((row) => {
      if (row.key !== key) return row;
      const going = row.staged[index];
      if (going) URL.revokeObjectURL(going.url);
      return { ...row, staged: row.staged.filter((_, at) => at !== index) };
    }),
  );
```

The unmount cleanup that revokes object URLs must cover rows too: the existing
`stagedRef` effect gains a `rowsRef` beside it, or one ref holding both lists.
A staged file whose URL is never revoked is a leak the browser will not
report.

- [ ] **Step 3: Rewrite the submit**

```ts
/**
 * Rows first, then pictures — Phase 27's order, because presign hangs a
 * `ProductImage` on a `productId` that does not exist until the rows are
 * written. Then: each row that staged its own images gets them, the shared
 * set is uploaded once to the first row that staged none, and the remaining
 * shareholders are served by an R2 copy rather than by seven more uploads.
 */
const submit = async () => {
  setSaving(true);

  const result = await createProductVariants({
    ...form,
    variants: rows.map((row) => ({
      variant: row.variant,
      sku: skuOf(row),
      listPrice: row.listPrice,
    })),
  });
  if (!result.success) {
    setSaving(false);
    toast.error(result.error);
    return;
  }

  const created = result.data.variants;
  const familyId = result.data.familyId;
  let uploaded = 0;
  let failed = 0;

  // Own pictures first, so a row that has them is never counted as a
  // shareholder below.
  for (const [index, row] of rows.entries()) {
    const id = created[index]?.id;
    if (!id || row.staged.length === 0) continue;
    const outcome = await add(id, row.staged.map((image) => image.file), 0);
    uploaded += outcome.uploaded;
    failed += outcome.failed;
  }

  const shareholders = rows
    .map((row, index) => ({ row, id: created[index]?.id }))
    .filter((entry): entry is { row: VariantRowState; id: string } =>
      Boolean(entry.id) && entry.row.staged.length === 0,
    );

  if (staged.length > 0 && shareholders.length > 0) {
    const [first, ...rest] = shareholders;
    const outcome = await add(first!.id, staged.map((image) => image.file), 0);
    uploaded += outcome.uploaded;
    failed += outcome.failed;

    if (outcome.uploaded > 0 && rest.length > 0) {
      const copy = await copyImagesToVariants(
        first!.id,
        rest.map((entry) => entry.id),
      );
      if (!copy.success) failed += rest.length;
      else failed += copy.data.failed;
    } else if (rest.length > 0) {
      // Nothing landed to copy, so every other shareholder is short too.
      failed += rest.length;
    }
  }

  if (failed > 0) {
    setSaving(false);
    setCreatedIds(created.map((variant) => variant.id));
    toast.error(
      uploaded > 0
        ? `${created.length === 1 ? "Product" : "Variants"} created — ${failed} image${failed === 1 ? "" : "s"} didn't upload`
        : `${created.length === 1 ? "Product" : "Variants"} created, but the images didn't upload`,
    );
    return;
  }

  toast.success(
    created.length === 1
      ? "Product created"
      : `${created.length} variants created`,
  );
  push(familyId && created.length > 1 ? `/products?family=${familyId}` : `/products/${created[0]!.id}`);
};
```

The existing `created: string | null` state becomes
`createdIds: string[]` (plus `createdFamilyId: string | null`, set from the same
result), because the recovery affordance now has to reach several rows. The
header's button becomes "Open the products" linking to
`/products?family={createdFamilyId}` when `createdIds.length > 1`, and keeps
today's "Open the product" to `/products/{createdIds[0]}` for one. Every
reference to the old `created` in the header and its caption becomes
`createdIds.length > 0` — the local `const created = result.data.variants`
inside `submit` is a different value and is not in scope there.

- [ ] **Step 4: Fix the Create gate**

The button's `disabled` becomes the spec's stated rule — an image somewhere,
for every row:

```ts
/**
 * Phase 27's rule, counted across rows: every product must land with a
 * picture, and there are two ways for that to be true — a shared set, or
 * pictures on every row that has none of the shared ones.
 */
const everyRowCovered =
  staged.length > 0 || rows.every((row) => row.staged.length > 0);
```

```tsx
<Button pending={busy} disabled={!everyRowCovered} onClick={submit}>
```

and the caption under it:

```tsx
{created.length > 0
  ? "Finish adding their images there"
  : !everyRowCovered
    ? "Add at least one image"
    : staged.length > 0
      ? `${staged.length} shared ${staged.length === 1 ? "image" : "images"} ready`
      : "Each variant has its own images"}
```

- [ ] **Step 5: Verify types, lint and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no type errors, 2 warnings / 0 errors, build clean.

Run `npx vitest run` too: nothing here is unit-tested, but `products.test.ts`
and every other suite must still pass — a changed action signature would show
up there.

- [ ] **Step 6: Commit**

```bash
git add src/components/products/VariantRows.tsx src/components/products/ProductForm.tsx
git commit -m "$(cat <<'MSG'
feat(products): create every variant of a product on one screen

Shared fields above, a row per variant below. The three fields that differ —
flavour, SKU and price — live in the details card while there is one variant,
so a single-variant create is the screen that existed before, and move into
the Variants table the moment a second row is added; row 0's values carry
across rather than appearing in two editable places.

One shared photo set covers every row that stages none of its own: uploaded
once, copied to the rest. Create stays disabled until every row would land
with a picture, which is Phase 27's rule counted across rows.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: Adding many lines to a cart

**Files:**
- Modify: `src/lib/validation/cart.ts`
- Modify: `src/lib/guest-cart.ts`
- Test: `src/lib/guest-cart.test.ts`
- Modify: `src/actions/cart.ts`
- Test: `src/actions/cart.test.ts`
- Modify: `src/components/shop/GuestCartProvider.tsx`

**Interfaces:**
- Consumes: the existing module-private `guard`, `openCart`, `upsertLine`,
  `isOrderable`, `ORDERABLE_PRODUCT_SELECT`, `revalidateShop` in `cart.ts`;
  `addLine`, `MAX_GUEST_LINES` in `guest-cart.ts`.
- Produces:
  ```ts
  // src/lib/validation/cart.ts
  export const addManyToCartSchema: z.ZodType<{ lines: { productId: string; cartons: number }[] }>

  // src/lib/guest-cart.ts
  export function addLines(cart: GuestCart, lines: GuestCartLine[]): GuestCart

  // src/actions/cart.ts
  export async function addManyToCart(input: {
    lines: { productId: string; cartons: number }[];
  }): Promise<ActionResult<{ added: number; skipped: number }>>

  // src/components/shop/GuestCartProvider.tsx — on GuestCartApi
  addMany: (lines: GuestCartLine[]) => void;
  ```

- [ ] **Step 1: Write the failing `addLines` test**

Append to `src/lib/guest-cart.test.ts`:

```ts
describe("addLines", () => {
  it("adds every line in one move", () => {
    const cart = addLines(EMPTY_GUEST_CART, [
      { productId: "a", cartons: 3 },
      { productId: "b", cartons: 2 },
    ]);
    expect(cart.lines).toEqual([
      { productId: "a", cartons: 3 },
      { productId: "b", cartons: 2 },
    ]);
  });

  it("increments a product already in the cart", () => {
    const cart = addLines(addLine(EMPTY_GUEST_CART, "a", 1), [
      { productId: "a", cartons: 2 },
      { productId: "b", cartons: 1 },
    ]);
    expect(cart.lines).toEqual([
      { productId: "a", cartons: 3 },
      { productId: "b", cartons: 1 },
    ]);
  });

  it("stops at the line cap rather than growing past it", () => {
    const full: GuestCart = {
      v: 1,
      lines: Array.from({ length: MAX_GUEST_LINES }, (_, index) => ({
        productId: `p-${index}`,
        cartons: 1,
      })),
      updatedAt: "",
    };
    const cart = addLines(full, [{ productId: "new", cartons: 1 }]);
    expect(cart.lines).toHaveLength(MAX_GUEST_LINES);
    expect(cart.lines.some((line) => line.productId === "new")).toBe(false);
  });

  it("still increments an existing line when the cart is full", () => {
    const full: GuestCart = {
      v: 1,
      lines: Array.from({ length: MAX_GUEST_LINES }, (_, index) => ({
        productId: `p-${index}`,
        cartons: 1,
      })),
      updatedAt: "",
    };
    const cart = addLines(full, [{ productId: "p-0", cartons: 4 }]);
    expect(cart.lines).toHaveLength(MAX_GUEST_LINES);
    expect(cart.lines[0]).toEqual({ productId: "p-0", cartons: 5 });
  });
});
```

Add `addLines` and `MAX_GUEST_LINES` to the file's existing import list, and
`GuestCart` to its type imports if it is not there already.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/guest-cart.test.ts`
Expected: FAIL — `addLines is not a function`.

- [ ] **Step 3: Write `addLines`**

In `src/lib/guest-cart.ts`, after `addLine`:

```ts
/**
 * Several lines in one move (Phase 39), for a buyer who picked quantities
 * against three flavours of one product and pressed Add to cart once.
 *
 * Folded through `addLine` so the rules are the same ones a single click gets
 * — an existing line increments, cartons clamp — with `MAX_GUEST_LINES`
 * applied per new line rather than to the batch, so a full cart can still take
 * an increment to something already on it.
 */
export function addLines(cart: GuestCart, lines: GuestCartLine[]): GuestCart {
  let next = cart;
  for (const line of lines) {
    const known = next.lines.some((existing) => existing.productId === line.productId);
    if (!known && next.lines.length >= MAX_GUEST_LINES) continue;
    next = addLine(next, line.productId, line.cartons);
  }
  return next;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/guest-cart.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing `addManyToCart` tests**

In `src/lib/validation/cart.ts`, add:

```ts
/**
 * Several lines in one action (Phase 39). `max` is the guest cap, which is a
 * ceiling on any one batch too: a request past it is a script, not a buyer
 * choosing flavours.
 */
export const addManyToCartSchema = z.object({
  lines: z
    .array(addToCartSchema)
    .min(1, "Choose a quantity for at least one variant")
    .max(MAX_GUEST_LINES),
});
```

Then append to `src/actions/cart.test.ts` (adding `addManyToCart` to the
existing action import):

```ts
describe("addManyToCart", () => {
  const client = { id: "user-1", buyerId: "buyer-1", role: "CLIENT" };

  beforeEach(() => {
    requireClient.mockResolvedValue(client);
    webOrderFindFirst.mockResolvedValue({ id: "cart-1" });
    lineUpsert.mockResolvedValue({});
  });

  it("upserts every line in one transaction", async () => {
    productFindMany.mockResolvedValue([
      { id: "p-1", active: true, needsReview: false, listPrice: new Prisma.Decimal("10") },
      { id: "p-2", active: true, needsReview: false, listPrice: new Prisma.Decimal("20") },
    ]);

    const result = await addManyToCart({
      lines: [
        { productId: "p-1", cartons: 3 },
        { productId: "p-2", cartons: 2 },
      ],
    });

    expect(result).toEqual({ success: true, data: { added: 2, skipped: 0 } });
    expect(lineUpsert).toHaveBeenCalledTimes(2);
    expect(lineUpsert).toHaveBeenCalledWith({
      where: { webOrderId_productId: { webOrderId: "cart-1", productId: "p-1" } },
      create: { webOrderId: "cart-1", productId: "p-1", cartons: 3 },
      update: { cartons: { increment: 3 } },
    });
  });

  it("reads every product in one query, not one per line", async () => {
    productFindMany.mockResolvedValue([
      { id: "p-1", active: true, needsReview: false, listPrice: new Prisma.Decimal("10") },
      { id: "p-2", active: true, needsReview: false, listPrice: new Prisma.Decimal("20") },
    ]);
    await addManyToCart({
      lines: [
        { productId: "p-1", cartons: 1 },
        { productId: "p-2", cartons: 1 },
      ],
    });
    expect(productFindMany).toHaveBeenCalledTimes(1);
    expect(productFindUnique).not.toHaveBeenCalled();
  });

  it("skips a line whose product has left the shop, and counts it", async () => {
    productFindMany.mockResolvedValue([
      { id: "p-1", active: true, needsReview: false, listPrice: new Prisma.Decimal("10") },
      { id: "p-2", active: false, needsReview: false, listPrice: new Prisma.Decimal("20") },
    ]);

    const result = await addManyToCart({
      lines: [
        { productId: "p-1", cartons: 1 },
        { productId: "p-2", cartons: 1 },
      ],
    });

    expect(result).toEqual({ success: true, data: { added: 1, skipped: 1 } });
    expect(lineUpsert).toHaveBeenCalledTimes(1);
  });

  it("refuses when every line has left the shop", async () => {
    productFindMany.mockResolvedValue([]);
    const result = await addManyToCart({ lines: [{ productId: "p-1", cartons: 1 }] });
    expect(result).toEqual({
      success: false,
      error: "Those products are not available to order.",
    });
    expect(lineUpsert).not.toHaveBeenCalled();
  });

  it("refuses an empty batch", async () => {
    const result = await addManyToCart({ lines: [] });
    expect(result).toEqual({
      success: false,
      error: "Choose a quantity for at least one variant",
    });
    expect(webOrderFindFirst).not.toHaveBeenCalled();
  });

  it("refuses anyone who is not a client", async () => {
    requireClient.mockRejectedValue(
      new (class extends Error {})("Sign in to order."),
    );
    await expect(
      addManyToCart({ lines: [{ productId: "p-1", cartons: 1 }] }),
    ).rejects.toThrow();
  });
});
```

The last test mirrors how the existing suite treats a non-`UnauthorizedError`
throw from the guard. If `cart.test.ts` already has a helper for the
unauthorised case, use that instead of re-inventing one and keep the assertion
it uses.

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run src/actions/cart.test.ts`
Expected: FAIL — `addManyToCart is not a function`.

- [ ] **Step 7: Write `addManyToCart`**

In `src/actions/cart.ts`, add `addManyToCartSchema` to the validation import
and the action immediately after `addToCart`:

```ts
/**
 * Several variants of one product, in one action (Phase 39).
 *
 * `mergeGuestCart`'s shape rather than a loop over `addToCart`: one query for
 * every product instead of one per line, and one transaction, because a
 * failure halfway through N sequential upserts would leave some flavours in
 * the cart while the buyer's screen still showed the quantities they set — a
 * retry would then double what had already landed.
 *
 * A line whose product has left the shop is skipped and counted, never
 * silently dropped; the caller says so. Every line gone is a refusal, because
 * "added to your order" would be false.
 */
export async function addManyToCart(input: {
  lines: { productId: string; cartons: number }[];
}): Promise<ActionResult<{ added: number; skipped: number }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = addManyToCartSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Those quantities are not valid.",
    };
  }

  try {
    const productIds = [...new Set(parsed.data.lines.map((line) => line.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: ORDERABLE_PRODUCT_SELECT,
    });
    const orderableIds = new Set(
      products.filter(isOrderable).map((product) => product.id),
    );

    const lines = parsed.data.lines.filter((line) => orderableIds.has(line.productId));
    const skipped = parsed.data.lines.length - lines.length;
    if (lines.length === 0) {
      return { success: false, error: "Those products are not available to order." };
    }

    const cart = await openCart(user.id, user.buyerId);
    await prisma.$transaction(async (tx) => {
      for (const line of lines) {
        await upsertLine(tx, cart.id, line.productId, line.cartons);
      }
    });

    revalidateShop();
    return { success: true, data: { added: lines.length, skipped } };
  } catch (cause) {
    console.error("[cart] addManyToCart", cause);
    return { success: false, error: "We couldn't add those to your order." };
  }
}
```

- [ ] **Step 8: Add `addMany` to the guest cart context**

In `src/components/shop/GuestCartProvider.tsx`: import `addLines`, add
`addMany: (lines: GuestCartLine[]) => void` to `GuestCartApi`, `addMany: () => {}`
to the default context value, and the callback beside `add`:

```ts
const addMany = useCallback(
  (lines: GuestCartLine[]) => persist((prev) => addLines(prev, lines)),
  [persist],
);
```

Include it in the memoised context value alongside `add` and `set`.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run src/actions/cart.test.ts src/lib/guest-cart.test.ts`
Expected: PASS.

- [ ] **Step 10: Watch one test catch its own removal**

Remove the `skipped` filter from `addManyToCart` (pass `parsed.data.lines`
straight to the transaction), run
`npx vitest run src/actions/cart.test.ts -t "skips a line whose product"`, and
confirm it **fails**. Restore it and confirm it passes.

- [ ] **Step 11: Run the full suite and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`

```bash
git add src/lib/validation/cart.ts src/lib/guest-cart.ts src/lib/guest-cart.test.ts src/actions/cart.ts src/actions/cart.test.ts src/components/shop/GuestCartProvider.tsx
git commit -m "$(cat <<'MSG'
feat(shop): add several variants to a cart in one action

mergeGuestCart's shape rather than a loop over addToCart: one query for every
product and one transaction, so a failure halfway through cannot leave some
flavours in the cart while the buyer's screen still shows the quantities they
set. A line whose product has left the shop is skipped and counted; every line
gone is a refusal, because "added to your order" would be false.

The guest path folds through addLine, so the cap and the clamp are the ones a
single click gets, and a full cart can still take an increment.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: A quantity per variant in the buy box

**Files:**
- Modify: `src/lib/queries/shop-catalogue.ts`
- Create: `src/components/shop/VariantBuyRows.tsx`
- Modify: `src/components/shop/BuyBox.tsx`
- Modify: `src/app/(storefront)/shop/products/[id]/page.tsx`

**Interfaces:**
- Consumes: `addManyToCart`, `guestCart.addMany` (Task 5); `CartonStepper`
  (`min` prop already exists), `variantLabels`, `useShopViewer`,
  `useCartCount`, `lineTotal`, `formatMYR`.
- Produces:
  ```ts
  // src/lib/queries/shop-catalogue.ts — ShopVariant gains two fields
  export type ShopVariant = {
    id: string; sku: string; name: string; variant: string | null;
    listPrice: string; packSize: number | null; unit: string;
  };

  // src/components/shop/VariantBuyRows.tsx
  export function VariantBuyRows(props: {
    variants: ShopVariant[];
    selectedId: string;
  }): React.JSX.Element
  ```

- [ ] **Step 1: Widen `ShopVariant`**

In `src/lib/queries/shop-catalogue.ts`: add `unit: true` to `VARIANT_SELECT`
(it already selects `packSize`), add `packSize: number | null` and
`unit: string` to the `ShopVariant` type, and map both in
`variantsOfProduct`'s return:

```ts
  return group.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    name: variant.name,
    variant: variant.variant,
    listPrice: variant.listPrice.toFixed(2),
    packSize: variant.packSize,
    unit: variant.unit,
  }));
```

Check `groupable()` in the same file passes `unit` through if it narrows the
row; if it does not need to, leave it.

- [ ] **Step 2: Write `VariantBuyRows.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { addManyToCart } from "@/actions/cart";
import { CartonStepper } from "@/components/shop/CartonStepper";
import { useGuestCart } from "@/components/shop/GuestCartProvider";
import { useShopViewer } from "@/components/shop/ShopViewer";
import { Button } from "@/components/ui/button";
import { lineTotal } from "@/lib/cartons";
import { formatMYR, sumDecimals } from "@/lib/money";
import { variantLabels } from "@/lib/product-groups";
import type { ShopVariant } from "@/lib/queries/shop-catalogue";

/**
 * A quantity against each flavour, added in one action (Phase 39).
 *
 * The chip picker above this stays and is not replaced: it is navigation, and
 * how a buyer reaches a flavour's own gallery, description and specs. This is
 * the other half they asked for — three cartons of Papaya and two of Lavender
 * without visiting two pages.
 *
 * Every row starts at 0 except the flavour whose page this is, which starts at
 * 1, so "add the one I am looking at" is still one click. `CartonStepper` takes
 * `min={0}` here rather than its default 1, because a row at 0 is a flavour not
 * being ordered and that is the state most rows are in; its `onChange`
 * resolves locally rather than calling a Server Action, which is the whole
 * point of collecting the quantities before sending them.
 *
 * Money is summed with `sumDecimals` over `lineTotal`'s own strings rather
 * than with `Number`: the figure beside Add to cart must be the one the cart
 * will show, and float addition of cents is how those two come to differ.
 */
export function VariantBuyRows({
  variants,
  selectedId,
}: {
  variants: ShopVariant[];
  selectedId: string;
}) {
  const viewer = useShopViewer();
  const guestCart = useGuestCart();
  const [pending, startTransition] = useTransition();
  const [cartons, setCartons] = useState<Record<string, number>>({ [selectedId]: 1 });

  const labels = variantLabels(variants);
  const chosen = variants
    .map((variant) => ({ variant, cartons: cartons[variant.id] ?? 0 }))
    .filter((row) => row.cartons > 0);
  const totalCartons = chosen.reduce((sum, row) => sum + row.cartons, 0);
  const total = sumDecimals(
    chosen.map((row) => lineTotal(row.cartons, row.variant.listPrice)),
  );
  const unit = variants[0]?.unit ?? "carton";

  const plural = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? "" : "s"}`;

  const run = () => {
    const lines = chosen.map((row) => ({
      productId: row.variant.id,
      cartons: row.cartons,
    }));
    if (lines.length === 0) return;

    const added = `${plural(totalCartons, unit)} across ${plural(lines.length, "variant")} added to your order.`;

    startTransition(async () => {
      if (viewer.kind !== "client") {
        guestCart.addMany(lines);
        // Reset before the toast, not after: a second click on a screen still
        // showing the old quantities would send them twice.
        setCartons({});
        toast.success(added);
        return;
      }

      const result = await addManyToCart({ lines });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setCartons({});
      if (result.data.skipped > 0) {
        toast.warning(
          `${added} ${plural(result.data.skipped, "variant")} ${result.data.skipped === 1 ? "is" : "are"} no longer available.`,
        );
      } else {
        toast.success(added);
      }
    });
  };

  return (
    <div className="mt-lg">
      <h3 className="text-[length:var(--text-caption)] font-semibold text-ink">
        How many of each
      </h3>

      <ul className="mt-xs flex flex-col divide-y divide-hairline border-y border-hairline">
        {variants.map((variant) => {
          const count = cartons[variant.id] ?? 0;
          const isSelected = variant.id === selectedId;

          return (
            <li
              key={variant.id}
              className="flex flex-wrap items-center gap-sm py-sm sm:flex-nowrap"
            >
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-[length:var(--text-body-sm)] ${
                    isSelected ? "font-semibold text-ink" : "text-ink-secondary"
                  }`}
                >
                  {labels.get(variant.id) ?? variant.sku}
                </p>
                <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                  {formatMYR(variant.listPrice)} per {variant.unit}
                  {isSelected ? " · on this page" : ""}
                </p>
              </div>

              <CartonStepper
                value={count}
                min={0}
                packSize={variant.packSize}
                unit={variant.unit}
                label={labels.get(variant.id) ?? variant.sku}
                onChange={async (next) => {
                  setCartons((current) => ({ ...current, [variant.id]: next }));
                  return { success: true };
                }}
              />

              <p className="w-24 shrink-0 text-right text-[length:var(--text-body-sm)] tabular-nums text-ink">
                {count > 0 ? formatMYR(lineTotal(count, variant.listPrice)) : "—"}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-md flex flex-wrap items-center justify-between gap-sm">
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          {totalCartons === 0
            ? "Choose a quantity"
            : `${plural(totalCartons, unit)} across ${plural(chosen.length, "variant")}`}
        </p>
        <p className="text-[length:var(--text-body-lg)] font-semibold tabular-nums text-ink">
          {formatMYR(total)}
        </p>
      </div>

      <Button
        type="button"
        pending={pending}
        disabled={totalCartons === 0}
        onClick={run}
        className="mt-sm h-control-lg w-full gap-xs"
      >
        <Plus className="size-4 shrink-0" aria-hidden />
        Add to cart
      </Button>
    </div>
  );
}
```

Three contracts to check rather than assume: `CartonStepper` takes
`{ value, packSize, unit, min?, onChange, label, size?, disabled? }` and its
`onChange` returns `Promise<{ success: boolean; error?: string }>`;
`sumDecimals(list: readonly MoneyInput[]): Decimal` is exported from
`@/lib/money`; and `useGuestCart()` exposes `addMany` after Task 5 step 8. If
`toast.warning` is not in this project's Sonner setup, use `toast` with the
message and keep the wording.

- [ ] **Step 3: Branch in `BuyBox`**

Add `variants: ShopVariant[]` to `BuyBox`'s props. Where the stepper, the
"Line total" block and `AddToCart` are today, render them only when
`variants.length <= 1`; otherwise render `<VariantBuyRows variants={variants} selectedId={productId} />`.
The headline price, the per-piece caption, the "View cart" link and the guest
reassurance line stay in both cases — they are the page's, not the row's. Add:

```tsx
{/* One variant: the box that existed before Phase 39, untouched. Several:
    a quantity against each, added together. The price above stays this
    page's own either way. */}
```

- [ ] **Step 4: Pass the variants through**

In `src/app/(storefront)/shop/products/[id]/page.tsx`, add `variants={variants}`
to the `<BuyBox …>` call. `variants` is already loaded on the line above for
`VariantPicker`, so there is no new query.

- [ ] **Step 5: Verify types, lint and build**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass; lint at 2 warnings / 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/queries/shop-catalogue.ts src/components/shop/VariantBuyRows.tsx src/components/shop/BuyBox.tsx "src/app/(storefront)/shop/products/[id]/page.tsx"
git commit -m "$(cat <<'MSG'
feat(shop): a quantity against each variant, added in one action

Three cartons of Papaya and two of Lavender without visiting two pages. Every
row starts at 0 except the flavour whose page it is, which starts at 1, so
adding the one on screen is unchanged. A single-variant product renders the
buy box that existed before, untouched.

The chip picker stays: it is how a buyer reaches a flavour's own gallery and
specs, which a quantity row does not replace.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: Drive it, prove it, clean up

**Files:**
- Modify: `context/current-feature.md`
- Modify: `docs/specs/39-variant-creation-and-multi-add.md` (§7 read back
  against what actually happened; §9 gains anything found)

No code changes unless this task finds a defect — in which case fix it here
and record it, rather than deferring it.

- [ ] **Step 1: Read the baseline**

Before touching anything, record the counts with a throwaway script in the
scratchpad (`npx tsx`), reading: `product.count()`, `productFamily.count()`,
`productImage.count()`, `productPrice.count()`, `webOrder.count()`,
`webOrderLine.count()`, `purchaseOrder.count()`, `user.count()`, and
`catalogLabel.count()`. The documented baseline is 308 products, 59 families,
400 purchase orders, 0 web orders, 2 users — confirm rather than assume, and
write the real numbers into the task notes.

The development database is the `ep-mute-frog` branch, the **last**
`DATABASE_URL` block in `.env.local` (the earlier `ep-red-hat` pair is dead —
see the memory note). Never touch production here.

- [ ] **Step 2: Promote the development member, and note it**

`/products/new` needs a super admin and the only real one is Google-only, so
promote `aisha@lovinghandsportal.com` to `SUPER_ADMIN` for this pass with
`scripts/grant-super-admin.ts`, and **revert it at the end, reading the row
back** rather than trusting the update's return value.

- [ ] **Step 3: Drive criteria 1–8 in a browser**

Use the Playwright MCP browser against `npm run dev`. Restart the dev server
first if `prisma generate` has run since it started — a stale client answers
"Unknown field" for every new relation.

1. One variant, no family: create it and land on its product page. Confirm the
   screen is the one that existed before — Variant, SKU and List price all in
   the details card.
2. Add two more rows: watch those three fields leave the card and appear in the
   table with row 0's values intact, and the family disclosure become required.
3. Submit three variants against a new family with one shared image. Read back
   from the database: 3 products, 3 prices, 1 family, all three `familyId`s
   equal, 3 `ProductImage` rows with distinct `r2Key`s, and `headObject` on
   all six objects (three originals, three derivatives) answering rather than
   `NotFound`.
4. Count the **network requests** to `/api/products/*/images/presign` and the
   R2 `PUT`s: exactly one upload, whatever the number of variants
   (criterion 7).
5. The shop: the card count rises by exactly 1, the card offers three options,
   and each option switches the picture, price and link.
6. Criterion 4: two rows carrying the same SKU — read the toast, then
   `product.count()` unchanged.
7. Criterion 5: a second row with no family — read the toast.
8. Criterion 8: a variant with its own staged image gets that image, not the
   shared one — compare the `r2Key`s.

- [ ] **Step 4: Drive criteria 9–12, as a real buyer**

Create a throwaway `CLIENT` against an existing buyer. On a single-variant
product page confirm one stepper and one Add to cart. On the three-variant
page set 3 and 2, press Add to cart once, and read `WebOrderLine`: two rows,
cartons 3 and 2. Press it again on one variant and confirm that line
increments rather than duplicating. Sign out and repeat as a guest, reading
`localStorage["lh-shop-cart"]` **verbatim** — product ids and cartons, and no
price anywhere in it.

- [ ] **Step 5: The sweep**

`/products/new` with three variant rows staged, and a multi-variant shop
product page, at 390 / 768 / 1440 — six combinations. Assert
`document.documentElement.scrollWidth === window.innerWidth` on every one. At
390 list every interactive element under 44px and check each against the
accepted classes recorded in `context/current-feature.md` (`SkipLink`, the
wordmark, the 32/36px search and category chips, footer rows, card-mode title
links, the shadcn `Switch` at 32×18). **Anything new is a defect to fix here,
not to add to the list.** Read the console: 0 errors.

- [ ] **Step 6: Clean up, counted both ends**

Delete everything this pass created, **by id**: the products, their prices,
their images and every R2 object (re-check each key with `headObject` and
expect `NotFound`), the family, the throwaway `CLIENT` with its audit and
`LoginAttempt` rows, the web order and its lines, and any `CatalogLabel` row
this pass registered that no product now uses. Revert the member's role and
read it back. Re-run the baseline script and show the numbers returning
exactly. Remove every temporary script.

- [ ] **Step 7: Record what happened**

Rewrite `docs/specs/39-variant-creation-and-multi-add.md` §7 as what was
measured, with the figures — not as the list of intentions it is now — and add
to §9 anything found and not fixed. Then update
`context/current-feature.md`: Phase 39 as the current feature with its status,
what was verified with numbers, and **what was not** (production, in
particular: this branch has never been deployed, and it is stacked on three
unmerged phases). Demote Phase 38 to "Previous phase" in the file's existing
style.

- [ ] **Step 8: Final verification and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Report the test count, and lint's warning/error counts, as figures.

```bash
git add context/current-feature.md docs/specs/39-variant-creation-and-multi-add.md
git commit -m "$(cat <<'MSG'
docs: phase 39 verified in the browser, with the figures

Records what was measured rather than what was intended: the counts read back
both ends, the single upload behind three variants' images, the two cart lines
from one action, and the six-combination overflow sweep. Says plainly what was
not verified — nothing on production, and this branch is stacked on three
unmerged phases.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Self-Review

**Spec coverage.**

| Spec section | Task |
|---|---|
| §2 data, family at two | Task 1 (rule), Task 2 (write) |
| §3 the create screen | Task 4 |
| §4 one action, one transaction | Task 2 |
| §5 images uploaded once, copied | Task 3 (server), Task 4 (the gate and the orchestration) |
| §6 buying several at once | Task 5 (server, guest), Task 6 (UI) |
| §7 criteria 1–8 | Task 7 steps 3 |
| §7 criteria 9–12 | Task 7 step 4 |
| §7 criterion 13 (guards) | Task 2, Task 3, Task 5 unit tests |
| §7 criteria 14–15 (image gate, overflow) | Task 4 step 4, Task 7 step 5 |
| §8 testing | Tasks 1, 2, 3, 5 unit; Task 7 browser |
| §9 known | Task 7 step 7 |

**Type consistency.** `ProductVariantsInput` (Task 1) is what
`createProductVariants` takes (Task 2) and what `ProductForm`'s `SharedInput`
omits `variants` from (Task 4). `VariantRowState` is Task 4's local state and
never crosses to the server — the submit maps it to the schema's
`{ variant, sku, listPrice }`. `ShopVariant` gains `packSize` and `unit` in
Task 6 step 1 before `VariantBuyRows` reads them in step 2.
`copyImagesToVariants(source, targets)` has the same argument order in Task 3's
tests, its implementation, and Task 4's submit. `addManyToCart({ lines })`
takes an object in Task 5's tests, implementation and Task 6's caller.

**Known gap, stated rather than left to be discovered.**
`useImageUploadQueue`'s `add` **replaces** its display rows on each call, so a
submit that makes more than one call (per-variant images, or per-variant plus a
shared set) shows only the last batch's progress rows. The aggregate counts in
Task 4's submit are what the toast reports, so nothing is misreported — but the
tiles under way are incomplete. A typical create (shared images only) makes one
call and is unaffected. Fixing the hook to append is out of this phase's scope;
if Task 7 finds it confusing in practice, record it in §9.

# Phase 40 — Product listings: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shop listing becomes one product family in one market, with flavour
and pack size as the variants a buyer chooses between; a super admin is told
which listing a product will join, and can open any listing to add, remove,
show or hide its variants; and a product's code follows its edits when the
generator made that code, never when it did not.

**Architecture:** No migration. A variant stays a `Product` row and a listing is
a `ProductFamily` per market, falling back to the group the shop already derives
from brand + name + market. Three things change in code that exists — the
grouping key, the variant labels, the edit drawer's SKU field — and three are
new: a pure listing resolver used by both the forms' message and the writes, an
admin page per listing, and two membership actions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4
(`@theme` tokens only), Prisma 7 on Neon, Zod 4, Vitest.

**Spec:** `docs/specs/40-product-listings.md`

## Global Constraints

- **No migration in this phase.** A change to `prisma/schema.prisma` means the
  plan is wrong — stop and report.
- **No new dependency.**
- **No `any`.** TypeScript strict; `unknown` plus narrowing.
- **Design system is mandatory.** Colours, type, radii and spacing come from the
  `@theme` tokens in `src/app/globals.css`. No raw hex, no px font size, no
  arbitrary Tailwind value — the `text-[length:var(--text-body-sm)]` form IS
  the house idiom, and a real token name is used here on purpose: Tailwind v4
  scans markdown too, and a wildcard inside `var()` compiles to invalid CSS and
  takes the whole stylesheet down.
  Read `context/design-system.md` before writing markup.
- **Sentence-case labels.** Touch targets **≥44px at 390px**.
- **Every product and family write is `requireSuperAdmin()`**, checked on the
  server. The admin room's 404 is the outer door; the guard is the lock.
- **Server Actions return `{ success, data, error }`**; errors surface by toast.
- **Doc comments explain *why*, not what** — the house style.
- **A SKU is only ever rewritten when the generator made it.** Eight production
  products carry the customer's own printed codes (`ZEN/SC/2100/CARROT`,
  `KE218441 68216`) and the purchase-order extraction matches lines to products
  by exact code. This is the phase's load-bearing safety rule.
- **Run before every commit:** `npx vitest run`, then `npx tsc --noEmit`, then
  `npm run lint`. Lint's baseline is **2 pre-existing warnings, 0 errors**.
- **A dev server runs on `http://localhost:3000`.** Do not start another and do
  not kill it — two dev servers sharing one `.next` broke an earlier phase.
- **Branch:** `feature/product-listings`, cut from `feature/variant-creation`.
- Commit messages end with
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
  and never say "Generated with Claude".

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/lib/listings.ts` | `resolveListing` and its types — which listing a brand+name+market belongs to, over a list of candidates. Pure. |
| `src/lib/listings.test.ts` | Its tests. |
| `src/components/admin/ListingMembers.tsx` | One market's section on the admin listing page: the variant rows and their show/hide/remove controls. |
| `src/components/admin/AddProductToListing.tsx` | The picker that puts a product into a family. |
| `src/app/(admin)/admin/catalogue/families/[id]/page.tsx` | The listing page. |
| `src/components/products/ListingNotice.tsx` | The "joins the existing listing" line, shared by the create form and the edit drawer. |

**Modified**

| File | Change |
|---|---|
| `src/lib/product-groups.ts` | `groupKey` drops pack size; `derivedKey` exported; `ProductGroup.packSize` becomes shared-or-null; `variantLabels` appends the pack where packs differ. |
| `src/lib/product-groups.test.ts` | The two pack-size pins rewritten; new label tests. |
| `src/lib/queries/shop-catalogue.ts` | `variantsOfProduct` drops `packSize` from its `where`; `ShopProductGroup.packSize` follows the group. |
| `src/lib/queries/shop-catalogue.test.ts` | The "two pack sizes are two cards" pin rewritten. |
| `src/components/shop/ShopProductCard.tsx` | The caption omits the pack when a listing mixes them. |
| `src/lib/queries/product-families.ts` | `findListing`, and `listingMembers` for the admin page. |
| `src/actions/products.ts` | `createProductVariants` and `updateProduct` resolve a listing when none was chosen. |
| `src/actions/product-families.ts` | `addProductToFamily`, `removeProductFromFamily`. |
| `src/actions/listings.ts` | *(created)* `lookupListing` — the forms' read. |
| `src/components/products/ProductForm.tsx` | Renders `ListingNotice`. |
| `src/components/products/ProductSheet.tsx` | Renders `ListingNotice`; the SKU field follows edits or offers Regenerate. |
| `src/lib/sku.ts` | `isGeneratedSku`. |
| `src/lib/sku.test.ts` | Its tests. |
| `src/components/products/FamiliesList.tsx` | Rows link to the listing page; a Markets column. |
| `context/current-feature.md`, `docs/specs/40-product-listings.md` | The record, after the browser pass. |

---

### Task 1: The grouping key and the variant labels

**Files:**
- Modify: `src/lib/product-groups.ts`
- Test: `src/lib/product-groups.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function derivedKey(product: Pick<Groupable, "brand" | "name" | "variant" | "market">): string
  export function groupKey(product: Groupable): string   // identity + market; pack size no longer in it
  // ProductGroup.packSize is now the shared pack, or null where the group mixes them
  export function variantLabels<
    T extends Pick<Groupable, "id" | "sku" | "variant" | "packSize"> & { unit?: string },
  >(variants: T[]): Map<string, string>
  ```

- [ ] **Step 1: Write the failing tests**

In `src/lib/product-groups.test.ts`, **replace** the two pack-size pins with
their opposites and add the label cases. Add `unitLabel`-shaped expectations.

Replace this test:

```ts
  it("keeps two pack sizes of the same cream apart", () => {
    const small = product({ id: "a", packSize: 6 });
    const large = product({ id: "b", packSize: 12 });
    expect(groupKey(small)).not.toBe(groupKey(large));
  });
```

with:

```ts
  it("puts two pack sizes of the same cream in one listing", () => {
    // Phase 40: a buyer thinks of 6-per-carton and 12-per-carton as one
    // product bought two ways. Pack size became a variant, not a listing.
    const small = product({ id: "a", packSize: 6 });
    const large = product({ id: "b", packSize: 12 });
    expect(groupKey(small)).toBe(groupKey(large));
  });
```

Replace this test:

```ts
  it("still keeps one family apart across two markets and two pack sizes", () => {
    const my = product({ id: "a", familyId: "fam1", market: "Malaysia" });
    const vn = product({ id: "b", familyId: "fam1", market: "Vietnam" });
    const big = product({ id: "c", familyId: "fam1", market: "Malaysia", packSize: 12 });
    expect(groupKey(my)).not.toBe(groupKey(vn));
    expect(groupKey(my)).not.toBe(groupKey(big));
  });
```

with:

```ts
  it("keeps one family apart across two markets, and together across two packs", () => {
    // A listing is a family in ONE market: the same cream for Malaysia and
    // for Vietnam carries different artwork and is a different thing to
    // order. Two carton sizes for one market are one listing.
    const my = product({ id: "a", familyId: "fam1", market: "Malaysia" });
    const vn = product({ id: "b", familyId: "fam1", market: "Vietnam" });
    const big = product({ id: "c", familyId: "fam1", market: "Malaysia", packSize: 12 });
    expect(groupKey(my)).not.toBe(groupKey(vn));
    expect(groupKey(my)).toBe(groupKey(big));
  });
```

Then append these, adding `derivedKey` to the file's import list:

```ts
describe("derivedKey", () => {
  it("ignores the family, so a placed product still matches its unplaced twin", () => {
    // What the resolver keys on: "which listing do these brand, name and
    // market describe", whether or not anyone has curated it yet.
    const placed = product({ id: "a", familyId: "fam1" });
    const loose = product({ id: "b", familyId: null });
    expect(derivedKey(placed)).toBe(derivedKey(loose));
  });

  it("separates two markets", () => {
    expect(derivedKey(product({ id: "a", market: "Malaysia" }))).not.toBe(
      derivedKey(product({ id: "b", market: "Indonesia" })),
    );
  });

  it("ignores pack size, like the group key it backs", () => {
    expect(derivedKey(product({ id: "a", packSize: 6 }))).toBe(
      derivedKey(product({ id: "b", packSize: 12 })),
    );
  });
});

describe("ProductGroup.packSize", () => {
  it("is the shared pack when every variant agrees", () => {
    const [group] = groupProducts([
      product({ id: "a", variant: "Papaya", packSize: 6 }),
      product({ id: "b", variant: "Carrot", packSize: 6 }),
    ]);
    expect(group!.packSize).toBe(6);
  });

  it("is null when the listing mixes packs, so no caption can claim one", () => {
    const [group] = groupProducts([
      product({ id: "a", variant: "Papaya", packSize: 6 }),
      product({ id: "b", variant: "Papaya", packSize: 12 }),
    ]);
    expect(group!.packSize).toBeNull();
  });
});

describe("variantLabels with mixed packs", () => {
  const variant = (id: string, flavour: string | null, packSize: number | null) => ({
    id,
    sku: `SKU-${id}`,
    variant: flavour,
    packSize,
    unit: "carton",
  });

  it("names the flavour alone when every variant shares a pack", () => {
    const labels = variantLabels([
      variant("a", "Papaya", 6),
      variant("b", "Carrot", 6),
    ]);
    expect(labels.get("a")).toBe("Papaya");
    expect(labels.get("b")).toBe("Carrot");
  });

  it("appends the pack when the listing holds more than one", () => {
    const labels = variantLabels([
      variant("a", "Carrot", 6),
      variant("b", "Carrot", 12),
      variant("c", "Papaya", 6),
    ]);
    expect(labels.get("a")).toBe("Carrot · 6 per carton");
    expect(labels.get("b")).toBe("Carrot · 12 per carton");
    expect(labels.get("c")).toBe("Papaya · 6 per carton");
  });

  it("says 'per carton' for a variant whose pack size is unknown", () => {
    const labels = variantLabels([variant("a", "Carrot", 6), variant("b", "Carrot", null)]);
    expect(labels.get("b")).toBe("Carrot · per carton");
  });

  it("honours the product's own unit", () => {
    const labels = variantLabels([
      { ...variant("a", "Carrot", 6), unit: "box" },
      { ...variant("b", "Carrot", 12), unit: "box" },
    ]);
    expect(labels.get("a")).toBe("Carrot · 6 per box");
  });

  it("still falls back to the SKU when two labels would read the same", () => {
    // The Phase 13 importer's collision suffixes put two identical rows
    // side by side; appending the pack does not separate them either.
    const labels = variantLabels([variant("a", "Cherry", 6), variant("b", "Cherry", 6)]);
    expect(labels.get("a")).toBe("Cherry (SKU-a)");
    expect(labels.get("b")).toBe("Cherry (SKU-b)");
  });

  it("calls an unnamed variant Standard, as it always has", () => {
    const labels = variantLabels([variant("a", null, 6)]);
    expect(labels.get("a")).toBe("Standard");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/product-groups.test.ts`
Expected: FAIL — `derivedKey` is not exported, the two rewritten key tests fail
against the current pack-in-key behaviour, and the label tests fail because no
pack is appended.

- [ ] **Step 3: Change the key and export `derivedKey`**

In `src/lib/product-groups.ts`, replace `groupKey` and add `derivedKey` above
it. Keep `SEP` and `groupName` exactly as they are.

```ts
/**
 * The listing a product's own words describe, ignoring any family: brand,
 * the name with its variant suffix off, and the market.
 *
 * Exported because two callers must agree on it — `groupKey` falls back to
 * it for a product nobody has placed, and `resolveListing` (Phase 40) uses
 * it to answer "which listing would this product join". If they disagreed,
 * the form would promise one listing and the write would pick another.
 */
export function derivedKey(
  product: Pick<Groupable, "brand" | "name" | "variant" | "market">,
): string {
  return [product.brand ?? "", groupName(product), product.market ?? ""].join(SEP);
}

/**
 * The key two products must share to be variants of one another: the same
 * family (or the same brand and name where there is none), and the same
 * market.
 *
 * Market is in the key and pack size is not, and the asymmetry is the
 * business's own (Phase 40). The same cream made for Vietnam and for
 * Malaysia carries different artwork and a different SKU, and offering one
 * to the other's buyer would be wrong. The same cream in a 6-carton and a
 * 12-carton is one product bought two ways, and splitting it hid the bigger
 * carton behind a second card nobody found. Pack size became a variant;
 * `variantLabels` prints it where a listing holds more than one.
 */
export function groupKey(product: Groupable): string {
  // A family id cannot collide with a brand + name pair: the pair carries a
  // NUL between its halves and a cuid never does.
  const identity = product.familyId
    ? [product.familyId]
    : [product.brand ?? "", groupName(product)];
  return [...identity, product.market ?? ""].join(SEP);
}
```

- [ ] **Step 4: Make the group's pack size shared-or-null**

`ProductGroup.packSize` keeps its type. In `groupProducts`, the group is seeded
from the first product as it is now; after the sort loop, recompute it. Replace

```ts
  for (const group of groups.values()) group.variants.sort(byVariant);
  return [...groups.values()];
```

with

```ts
  for (const group of groups.values()) {
    group.variants.sort(byVariant);
    // The pack belongs to the *group* only when every variant agrees. A
    // listing that mixes 6 and 12 has no single pack to caption, and saying
    // one would be false for half its variants — `variantLabels` carries it
    // per variant there instead.
    const packs = new Set(group.variants.map((variant) => variant.packSize));
    group.packSize = packs.size === 1 ? (group.variants[0]?.packSize ?? null) : null;
  }
  return [...groups.values()];
```

Update `ProductGroup`'s doc for `packSize`:

```ts
  /** The pack every variant shares, or null where the listing mixes them. */
  packSize: number | null;
```

- [ ] **Step 5: Teach `variantLabels` the pack**

Add `import { unitLabel } from "@/lib/cartons";` at the top of the file, and
replace `variantLabels` entirely:

```ts
/**
 * What each variant is called in the picker.
 *
 * The flavour, and — only where a listing holds more than one pack size —
 * the pack beside it, because that is the other thing the buyer is choosing
 * between (Phase 40). A listing whose variants all ship 6 per carton says
 * "Papaya", not "Papaya · 6 per carton": repeating on every chip what the
 * card already says once is noise.
 *
 * Where two labels still read the same — the Phase 13 importer's collision
 * suffixes put `ZEN-SC-1000-CH` beside `ZEN-SC-1000-CH-2`, identical in
 * name, variant and pack — the SKU is appended so the two are told apart
 * rather than rendering as two identical buttons. That is a data defect
 * showing through honestly, not one being hidden.
 */
export function variantLabels<
  T extends Pick<Groupable, "id" | "sku" | "variant" | "packSize"> & { unit?: string },
>(variants: T[]): Map<string, string> {
  const packs = new Set(variants.map((variant) => variant.packSize));
  const mixedPacks = packs.size > 1;

  const base = (variant: T) => {
    const flavour = variant.variant ?? "Standard";
    return mixedPacks
      ? `${flavour} · ${unitLabel(variant.packSize, variant.unit ?? "carton")}`
      : flavour;
  };

  const seen = new Map<string, number>();
  for (const variant of variants) {
    const label = base(variant);
    seen.set(label, (seen.get(label) ?? 0) + 1);
  }

  const labels = new Map<string, string>();
  for (const variant of variants) {
    const label = base(variant);
    labels.set(variant.id, (seen.get(label) ?? 0) > 1 ? `${label} (${variant.sku})` : label);
  }
  return labels;
}
```

`Groupable` already carries `packSize`, so every existing caller satisfies the
widened constraint; `unit` is optional and defaults to `"carton"`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/lib/product-groups.test.ts`
Expected: PASS, including every test this task did not touch.

- [ ] **Step 7: Full suite, then commit**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`

Other suites **will** fail here — `shop-catalogue.test.ts` still pins "two pack
sizes are two cards". That is Task 2's work. Note which fail in your report and
commit anyway: this task's own suite is green and the change is coherent.

```bash
git add src/lib/product-groups.ts src/lib/product-groups.test.ts
git commit -m "$(cat <<'MSG'
feat(shop): pack size becomes a variant, not a separate listing

A listing is a family in one market. The same cream at 6 and at 12 per
carton is one product bought two ways, and splitting it hid the bigger
carton behind a second card nobody found; market stays in the key because
different artwork and a different SKU really are a different thing to order.

variantLabels prints the pack only where a listing holds more than one, and
derivedKey is exported so the Phase 40 resolver and the grouping fallback
cannot disagree about which listing a product describes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: The shop reads the new key

**Files:**
- Modify: `src/lib/queries/shop-catalogue.ts`
- Test: `src/lib/queries/shop-catalogue.test.ts`
- Modify: `src/components/shop/ShopProductCard.tsx`

**Interfaces:**
- Consumes: `groupKey`, `variantLabels`, `ProductGroup.packSize` (Task 1).
- Produces: `ShopProductGroup.packSize` is the shared pack or null;
  `variantsOfProduct` no longer filters on `packSize`.

- [ ] **Step 1: Rewrite the failing pin**

In `src/lib/queries/shop-catalogue.test.ts`, replace

```ts
  it("keeps two pack sizes of the same product as two cards", async () => {
```

and its body with:

```ts
  it("draws one card for two pack sizes of the same product", async () => {
    // Phase 40: pack size is a variant. The card's own caption drops the
    // pack when the listing mixes them, because no single figure is true.
    productFindMany.mockResolvedValueOnce([
      variantRow("Papaya", { id: "p-small", sku: "ZEN-PP-6", packSize: 6 }),
      variantRow("Papaya", { id: "p-big", sku: "ZEN-PP-12", packSize: 12 }),
    ]);
    productFindMany.mockResolvedValueOnce([]);

    const catalogue = await listShopProducts(query());

    expect(catalogue.groups).toHaveLength(1);
    expect(catalogue.groups[0]!.variants).toHaveLength(2);
    expect(catalogue.groups[0]!.packSize).toBeNull();
  });
```

Match the surrounding tests' own mock setup exactly — read two neighbours
before writing this, because the number of `productFindMany` calls a test
queues is what makes it pass or hang.

Add one more:

```ts
  it("does not narrow a variant lookup by pack size", async () => {
    // A buyer on the 6-carton page must be offered the 12-carton one.
    productFindMany.mockResolvedValueOnce([]);
    await variantsOfProduct({
      id: "p-1",
      sku: "ZEN-PP-6",
      name: "ZEN 2.1L",
      familyId: "fam-1",
      brand: "Zen Garden",
      variant: "Papaya",
      packSize: 6,
      market: "Malaysia",
    });
    const where = productFindMany.mock.calls.at(-1)?.[0]?.where;
    expect(where).not.toHaveProperty("packSize");
    expect(where).toMatchObject({ familyId: "fam-1", market: "Malaysia" });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/queries/shop-catalogue.test.ts`
Expected: FAIL — one card expected, two received; and `where` still carries
`packSize`.

- [ ] **Step 3: Drop pack size from the variant lookup**

In `variantsOfProduct`, remove the `packSize` line from the `where`:

```ts
  const candidates = await prisma.product.findMany({
    where: {
      ...SHOP_VISIBLE,
      ...(product.familyId ? { familyId: product.familyId } : { brand: product.brand }),
      // Pack size is deliberately absent (Phase 40): it is a variant now, so
      // the 12-carton row must be offered on the 6-carton row's page.
      market: product.market,
    },
    select: VARIANT_SELECT,
    orderBy: { name: "asc" },
  });
```

`listShopProducts` needs no change — its group's `packSize` now comes from
`groupProducts`, which Task 1 taught to return the shared pack or null.

- [ ] **Step 4: The card's caption tells the truth**

In `src/components/shop/ShopProductCard.tsx`, the caption currently reads

```ts
  const packCaption = [unitLabel(group.packSize, group.unit), group.market]
    .filter(Boolean)
    .join(" · ");
```

`unitLabel(null, "carton")` returns `"per carton"`, which on a mixed listing
claims a pack it does not have. Replace with:

```ts
  // "12 per carton · Malaysia". The pack half is dropped where the listing
  // mixes packs (Phase 40) — the picker carries it per variant there, and
  // "per carton" alone would read as a claim about all of them.
  const packCaption = [
    group.packSize === null ? null : unitLabel(group.packSize, group.unit),
    group.market,
  ]
    .filter(Boolean)
    .join(" · ");
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/queries/shop-catalogue.test.ts src/lib/product-groups.test.ts`
Expected: PASS.

- [ ] **Step 6: Full suite, typecheck, lint, build, then commit**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: all green, lint at its 2-warning baseline. If another suite fails
here, it is a real consequence of the key change — report it rather than
adjusting its expectation without saying so.

```bash
git add src/lib/queries/shop-catalogue.ts src/lib/queries/shop-catalogue.test.ts src/components/shop/ShopProductCard.tsx
git commit -m "$(cat <<'MSG'
feat(shop): one card for every pack size of a listing

variantsOfProduct stops narrowing by pack size, so the 12-carton row is
offered on the 6-carton row's page, and the card's caption drops the pack
where a listing mixes them rather than claiming one that is true of half
its variants.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: The listing resolver

**Files:**
- Create: `src/lib/listings.ts`
- Test: `src/lib/listings.test.ts`

**Interfaces:**
- Consumes: `derivedKey` (Task 1).
- Produces:
  ```ts
  export type ListingCandidate = {
    id: string;
    brand: string | null;
    name: string;
    variant: string | null;
    market: string | null;
    familyId: string | null;
    familyName: string | null;
  };

  export type ListingMatch =
    | { kind: "family"; familyId: string; familyName: string; members: number }
    | { kind: "derived"; title: string; memberIds: string[] }
    | { kind: "ambiguous"; families: { id: string; name: string }[] }
    | { kind: "new" };

  export function resolveListing(
    product: { brand: string | null; name: string; variant: string | null; market: string | null },
    candidates: ListingCandidate[],
    excludeId?: string,
  ): ListingMatch
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/listings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveListing, type ListingCandidate } from "@/lib/listings";

const candidate = (over: Partial<ListingCandidate> & Pick<ListingCandidate, "id">): ListingCandidate => ({
  brand: "Zen Garden",
  name: "Zen Garden Shower Cream 2.1L",
  variant: "Goat's Milk",
  market: "Indonesia",
  familyId: null,
  familyName: null,
  ...over,
});

/** The product being created or edited. */
const entering = {
  brand: "Zen Garden",
  name: "Zen Garden Shower Cream 2.1L",
  variant: "Carrot",
  market: "Indonesia",
};

describe("resolveListing", () => {
  it("finds the family a matching product already carries", () => {
    const match = resolveListing(entering, [
      candidate({ id: "a", familyId: "fam-1", familyName: "Zen Garden Shower Cream 2.1L" }),
    ]);
    expect(match).toEqual({
      kind: "family",
      familyId: "fam-1",
      familyName: "Zen Garden Shower Cream 2.1L",
      members: 1,
    });
  });

  it("counts every member of the family, not just the first", () => {
    const match = resolveListing(entering, [
      candidate({ id: "a", familyId: "fam-1", familyName: "F" }),
      candidate({ id: "b", variant: "Papaya", familyId: "fam-1", familyName: "F" }),
    ]);
    expect(match).toMatchObject({ kind: "family", members: 2 });
  });

  it("reports a derived group that nobody has made a family of", () => {
    const match = resolveListing(entering, [
      candidate({ id: "a" }),
      candidate({ id: "b", variant: "Papaya" }),
    ]);
    expect(match).toEqual({
      kind: "derived",
      title: "Zen Garden Shower Cream 2.1L",
      memberIds: ["a", "b"],
    });
  });

  it("refuses to guess when the matching products carry two families", () => {
    const match = resolveListing(entering, [
      candidate({ id: "a", familyId: "fam-1", familyName: "One" }),
      candidate({ id: "b", familyId: "fam-2", familyName: "Two" }),
    ]);
    expect(match).toEqual({
      kind: "ambiguous",
      families: [
        { id: "fam-1", name: "One" },
        { id: "fam-2", name: "Two" },
      ],
    });
  });

  it("is a new listing when nothing matches", () => {
    expect(resolveListing(entering, [])).toEqual({ kind: "new" });
  });

  it("ignores a candidate in another market", () => {
    // The user's own rule: the same cream for two markets is two listings.
    const match = resolveListing(entering, [
      candidate({ id: "a", market: "Malaysia", familyId: "fam-1", familyName: "F" }),
    ]);
    expect(match).toEqual({ kind: "new" });
  });

  it("ignores a candidate of another brand", () => {
    expect(
      resolveListing(entering, [candidate({ id: "a", brand: "Everfresh" })]),
    ).toEqual({ kind: "new" });
  });

  it("matches across the importer's variant suffix", () => {
    // "ZEN 2.1L — Goat's Milk" and a row named "ZEN 2.1L" are one listing;
    // groupName strips the suffix before the comparison.
    const match = resolveListing(
      { ...entering, name: "ZEN 2.1L", variant: "Carrot" },
      [candidate({ id: "a", name: "ZEN 2.1L — Goat's Milk", variant: "Goat's Milk" })],
    );
    expect(match).toMatchObject({ kind: "derived", memberIds: ["a"] });
  });

  it("does not match a product against itself when editing", () => {
    // The edit drawer passes the row's own id; without this a lone product
    // would report that it joins the listing it already is.
    const match = resolveListing(entering, [candidate({ id: "self" })], "self");
    expect(match).toEqual({ kind: "new" });
  });

  it("still finds the family when editing a product that is already in it", () => {
    const match = resolveListing(
      entering,
      [
        candidate({ id: "self", familyId: "fam-1", familyName: "F" }),
        candidate({ id: "other", variant: "Papaya", familyId: "fam-1", familyName: "F" }),
      ],
      "self",
    );
    expect(match).toMatchObject({ kind: "family", familyId: "fam-1", members: 1 });
  });

  it("names the derived listing by the shared name, not the variant's", () => {
    const match = resolveListing({ ...entering, name: "ZEN 2.1L — Carrot" }, [
      candidate({ id: "a", name: "ZEN 2.1L — Goat's Milk", variant: "Goat's Milk" }),
    ]);
    expect(match).toMatchObject({ title: "ZEN 2.1L" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/listings.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/listings"`.

- [ ] **Step 3: Write the resolver**

Create `src/lib/listings.ts`:

```ts
import { derivedKey, groupName } from "@/lib/product-groups";

/**
 * Which listing a product belongs to (Phase 40).
 *
 * A listing is a `ProductFamily` in one market. Until somebody curates one,
 * the shop derives it from brand + name + market, so "which listing does
 * this product join" has three possible answers and one refusal:
 *
 * - a **family** one of its future siblings already carries;
 * - a **derived** group of products nobody has placed in a family yet, which
 *   the write turns into a real family so the listing stops being a
 *   coincidence of names;
 * - **new**, when nothing matches;
 * - **ambiguous**, when the matching products carry more than one family —
 *   possible after curation, and not a thing to guess at. The form asks and
 *   the write refuses.
 *
 * Pure: the caller does the reading. The same function runs on the form, to
 * tell the reader what will happen, and inside the write, to make it happen
 * — which is what stops the message and the outcome disagreeing.
 */
export type ListingCandidate = {
  id: string;
  brand: string | null;
  name: string;
  variant: string | null;
  market: string | null;
  familyId: string | null;
  familyName: string | null;
};

export type ListingMatch =
  | { kind: "family"; familyId: string; familyName: string; members: number }
  | { kind: "derived"; title: string; memberIds: string[] }
  | { kind: "ambiguous"; families: { id: string; name: string }[] }
  | { kind: "new" };

export function resolveListing(
  product: { brand: string | null; name: string; variant: string | null; market: string | null },
  candidates: ListingCandidate[],
  excludeId?: string,
): ListingMatch {
  const key = derivedKey(product);
  // The product's own row is not its own sibling: the edit drawer reads the
  // whole catalogue, including the row being edited.
  const members = candidates.filter(
    (candidate) => candidate.id !== excludeId && derivedKey(candidate) === key,
  );
  if (members.length === 0) return { kind: "new" };

  const families = new Map<string, string>();
  for (const member of members) {
    if (member.familyId) families.set(member.familyId, member.familyName ?? "");
  }

  if (families.size > 1) {
    return {
      kind: "ambiguous",
      families: [...families].map(([id, name]) => ({ id, name })),
    };
  }

  const [entry] = [...families];
  if (entry) {
    const [familyId, familyName] = entry;
    return {
      kind: "family",
      familyId,
      familyName,
      members: members.filter((member) => member.familyId === familyId).length,
    };
  }

  return {
    kind: "derived",
    title: groupName(product),
    memberIds: members.map((member) => member.id),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/listings.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Watch one test catch its own removal**

Delete the `candidate.id !== excludeId &&` clause, run
`npx vitest run src/lib/listings.test.ts -t "does not match a product against itself"`,
and confirm it **fails**. Restore it and confirm it passes. `git diff` must show
the clause back before committing.

- [ ] **Step 6: Full suite, then commit**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`

```bash
git add src/lib/listings.ts src/lib/listings.test.ts
git commit -m "$(cat <<'MSG'
feat(products): resolve which listing a product joins

One pure function with three answers and a refusal: an existing family, a
derived group nobody has curated yet, a new listing, or — when the matching
products carry two families — ambiguous, which is not a thing to guess at.

It runs on the form to say what will happen and inside the write to make it
happen, which is what stops the two disagreeing.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: The writes join a listing

**Files:**
- Modify: `src/lib/queries/product-families.ts`
- Modify: `src/actions/products.ts`
- Test: `src/actions/products.test.ts`

**Interfaces:**
- Consumes: `resolveListing`, `ListingMatch`, `ListingCandidate` (Task 3);
  `generateFamilyCode`, `sizeInName` from `src/lib/sku.ts`.
- Produces:
  ```ts
  // src/lib/queries/product-families.ts
  export async function listingCandidates(
    input: { brand: string | null; market: string | null },
    client?: Prisma.TransactionClient,
  ): Promise<ListingCandidate[]>
  ```
  `createProductVariants` and `updateProduct` assign a family through the
  resolver when the input carries neither `familyId` nor `newFamily`, and
  refuse with `"That product matches two listings — choose a family."` on an
  ambiguous match.

- [ ] **Step 1: Write the failing tests**

Append to `src/actions/products.test.ts`. The prisma mock already exposes
`product.findMany` as `productFindMany` on the module mock and
`productFamily.create` as `familyCreate` on `tx`; add `productUpdateMany` to
both the module mock's `product` object and `tx.product` — read the existing
mock block and extend it rather than restructuring it.

```ts
describe("createProductVariants joining a listing", () => {
  const shared = {
    name: "Zen Garden Shower Cream 2.1L",
    category: "Shower cream & gel",
    unit: "carton",
    brand: "Zen Garden",
    packSize: 6,
    cartonsPerPallet: 60,
    market: "Indonesia",
    description: null,
    active: true,
    familyId: null,
    newFamily: null,
  };
  const oneRow = [{ variant: "Carrot", sku: "ZS-SC-2100-CR-ID", listPrice: "10.00" }];

  beforeEach(() => {
    requireSuperAdmin.mockResolvedValue(admin);
    labelFindFirst.mockResolvedValue({ id: "label-1" });
    productCreate.mockResolvedValue({ id: "prd-new", sku: "ZS-SC-2100-CR-ID" });
    priceCreate.mockResolvedValue({ id: "price-1" });
    familyCreate.mockResolvedValue({ id: "fam-new" });
    productUpdateMany.mockResolvedValue({ count: 0 });
  });

  it("joins the family a matching product already carries", async () => {
    productFindMany.mockResolvedValue([
      {
        id: "prd-gm",
        brand: "Zen Garden",
        name: "Zen Garden Shower Cream 2.1L",
        variant: "Goat's Milk",
        market: "Indonesia",
        familyId: "fam-1",
        family: { name: "Zen Garden Shower Cream 2.1L" },
      },
    ]);

    const result = await createProductVariants({ ...shared, variants: oneRow });

    expect(result).toMatchObject({ success: true, data: { familyId: "fam-1" } });
    expect(familyCreate).not.toHaveBeenCalled();
    expect(productCreate.mock.calls[0]?.[0]?.data?.familyId).toBe("fam-1");
  });

  it("creates one family for a derived group and assigns every member", async () => {
    productFindMany.mockResolvedValue([
      {
        id: "prd-gm",
        brand: "Zen Garden",
        name: "Zen Garden Shower Cream 2.1L",
        variant: "Goat's Milk",
        market: "Indonesia",
        familyId: null,
        family: null,
      },
    ]);

    const result = await createProductVariants({ ...shared, variants: oneRow });

    expect(result).toMatchObject({ success: true, data: { familyId: "fam-new" } });
    expect(familyCreate).toHaveBeenCalledTimes(1);
    // The members nobody opened are moved into it too — that is what turns
    // a coincidence of names into a curated listing.
    expect(productUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["prd-gm"] } },
      data: { familyId: "fam-new" },
    });
  });

  it("creates no family when nothing matches", async () => {
    productFindMany.mockResolvedValue([]);
    const result = await createProductVariants({ ...shared, variants: oneRow });
    expect(result).toMatchObject({ success: true, data: { familyId: null } });
    expect(familyCreate).not.toHaveBeenCalled();
    expect(productUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses rather than guess when two families match", async () => {
    productFindMany.mockResolvedValue([
      { id: "a", brand: "Zen Garden", name: shared.name, variant: "Goat's Milk", market: "Indonesia", familyId: "fam-1", family: { name: "One" } },
      { id: "b", brand: "Zen Garden", name: shared.name, variant: "Papaya", market: "Indonesia", familyId: "fam-2", family: { name: "Two" } },
    ]);

    const result = await createProductVariants({ ...shared, variants: oneRow });

    expect(result).toEqual({
      success: false,
      error: "That product matches two listings — choose a family.",
    });
    expect(productCreate).not.toHaveBeenCalled();
  });

  it("leaves an explicitly chosen family alone", async () => {
    const result = await createProductVariants({
      ...shared,
      familyId: "fam-chosen",
      variants: oneRow,
    });
    expect(result).toMatchObject({ success: true, data: { familyId: "fam-chosen" } });
    // No lookup at all: the reader already answered the question.
    expect(productFindMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/actions/products.test.ts`
Expected: FAIL — the resolver is not wired in, so `familyId` comes back `null`
and `productUpdateMany` is never called.

- [ ] **Step 3: Add the candidate read**

In `src/lib/queries/product-families.ts`:

```ts
import type { ListingCandidate } from "@/lib/listings";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The products a listing lookup has to consider: same brand, same market.
 *
 * Narrowed in the database on the two fields that are exact, and left to
 * `resolveListing` to compare the third — the name, which needs
 * `groupName`'s variant-suffix rule and cannot be expressed in a `where`.
 *
 * Takes the client to read through, so a write can run the same lookup
 * inside its own transaction and see its own uncommitted rows.
 */
export async function listingCandidates(
  input: { brand: string | null; market: string | null },
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<ListingCandidate[]> {
  const rows = await client.product.findMany({
    where: { brand: input.brand, market: input.market },
    select: {
      id: true,
      brand: true,
      name: true,
      variant: true,
      market: true,
      familyId: true,
      family: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    brand: row.brand,
    name: row.name,
    variant: row.variant,
    market: row.market,
    familyId: row.familyId,
    familyName: row.family?.name ?? null,
  }));
}
```

- [ ] **Step 4: Wire the resolver into both writes**

In `src/actions/products.ts`, add a module-private helper above
`createProductVariants`:

```ts
const TWO_LISTINGS = "That product matches two listings — choose a family.";

/**
 * The family a write should use when the reader chose none (Phase 40).
 *
 * Returns the family id to stamp on the row, or a refusal. A derived group
 * becomes a real family here — created once, with **every** member moved
 * into it — because a listing that exists only as a coincidence of names is
 * one nobody can curate, and the moment a second variant arrives is the
 * moment to fix that.
 *
 * Reads through `tx`, so a batch creating three variants sees the family its
 * own first row just created rather than making three.
 */
async function joinListing(
  tx: Prisma.TransactionClient,
  product: {
    brand: string | null;
    name: string;
    variant: string | null;
    market: string | null;
    category: string;
  },
  excludeId?: string,
): Promise<{ familyId: string | null } | { error: string }> {
  const candidates = await listingCandidates(
    { brand: product.brand, market: product.market },
    tx,
  );
  const match = resolveListing(product, candidates, excludeId);

  if (match.kind === "ambiguous") return { error: TWO_LISTINGS };
  if (match.kind === "new") return { familyId: null };
  if (match.kind === "family") return { familyId: match.familyId };

  const family = await tx.productFamily.create({
    data: {
      code: generateFamilyCode({
        brand: product.brand,
        category: product.category,
        size: sizeInName(product.name),
      }),
      name: match.title,
      brand: product.brand,
      category: product.category,
      size: sizeInName(product.name),
    },
    select: { id: true },
  });
  await tx.product.updateMany({
    where: { id: { in: match.memberIds } },
    data: { familyId: family.id },
  });
  return { familyId: family.id };
}
```

Add the imports it needs:

```ts
import { listingCandidates } from "@/lib/queries/product-families";
import { resolveListing } from "@/lib/listings";
import { generateFamilyCode, sizeInName } from "@/lib/sku";
```

In `createProductVariants`, replace the family resolution line

```ts
      const familyId = data.newFamily
        ? (await tx.productFamily.create({ data: data.newFamily, select: { id: true } })).id
        : data.familyId;
```

with

```ts
      let familyId = data.newFamily
        ? (await tx.productFamily.create({ data: data.newFamily, select: { id: true } })).id
        : data.familyId;

      // Nothing chosen: join the listing this product describes, creating
      // it from the products already in it where it is not a family yet.
      if (!familyId) {
        const joined = await joinListing(tx, {
          brand: data.brand,
          name: data.name,
          variant: data.variants[0]?.variant ?? null,
          market: data.market,
          category: data.category,
        });
        if ("error" in joined) throw new ListingConflict(joined.error);
        familyId = joined.familyId;
      }
```

and define, near `duplicate`:

```ts
/** Thrown inside a transaction so the rollback is Postgres's, then caught
 *  and returned as the action's own refusal. */
class ListingConflict extends Error {}
```

In the action's `catch`, before the `duplicate(cause)` branch:

```ts
    if (cause instanceof ListingConflict) {
      return { success: false, error: cause.message };
    }
```

Apply the identical three changes to `updateProduct`, passing `productId` as
`joinListing`'s `excludeId` and the edited row's own `variant`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/actions/products.test.ts`
Expected: PASS — the 5 new tests and every existing one.

- [ ] **Step 6: Watch one test catch its own removal**

Delete the `await tx.product.updateMany(...)` call from `joinListing`, run
`npx vitest run src/actions/products.test.ts -t "creates one family for a derived group"`,
and confirm it **fails**. Restore it and confirm it passes.

- [ ] **Step 7: Full suite, then commit**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`

```bash
git add src/lib/queries/product-families.ts src/actions/products.ts src/actions/products.test.ts
git commit -m "$(cat <<'MSG'
feat(products): a product joins the listing it describes

When the reader chooses no family, the write resolves one: an existing
family is used, a derived group becomes a real family with every member
moved into it, nothing matching stays unplaced, and two matching families
are a refusal rather than a guess.

The lookup reads through the transaction, so a batch creating three
variants sees the family its own first row just made instead of making
three.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: The forms say which listing

**Files:**
- Create: `src/actions/listings.ts`
- Create: `src/components/products/ListingNotice.tsx`
- Modify: `src/components/products/ProductForm.tsx`
- Modify: `src/components/products/ProductSheet.tsx`
- Test: `src/actions/listings.test.ts`

**Interfaces:**
- Consumes: `resolveListing`, `ListingMatch` (Task 3); `listingCandidates` (Task 4).
- Produces:
  ```ts
  // src/actions/listings.ts
  export async function lookupListing(input: {
    brand: string | null; name: string; variant: string | null; market: string | null; excludeId?: string;
  }): Promise<ActionResult<ListingMatch>>

  // src/components/products/ListingNotice.tsx
  export function ListingNotice(props: {
    brand: string | null; name: string; variant: string | null; market: string | null;
    excludeId?: string;
    /** Set while the reader has chosen a family themselves; the notice then
     *  says which one will be used instead of looking one up. */
    chosenFamilyName?: string | null;
  }): React.JSX.Element | null
  ```

- [ ] **Step 1: Write the failing action test**

Create `src/actions/listings.test.ts`, following `src/actions/products.test.ts`'s
mock style — `vi.mock("@/lib/prisma")` with `product.findMany`, and
`vi.mock("@/lib/auth-guards")` with `requireSuperAdmin`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const productFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { product: { findMany: productFindMany } } }));

class UnauthorizedError extends Error {}
const requireSuperAdmin = vi.fn();
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError,
  requireSuperAdmin: () => requireSuperAdmin(),
}));

const { lookupListing } = await import("@/actions/listings");

const entering = {
  brand: "Zen Garden",
  name: "Zen Garden Shower Cream 2.1L",
  variant: "Carrot",
  market: "Indonesia",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdmin.mockResolvedValue({ id: "user-1", role: "SUPER_ADMIN" });
});

describe("lookupListing", () => {
  it("reports the family a matching product carries", async () => {
    productFindMany.mockResolvedValue([
      {
        id: "a",
        brand: "Zen Garden",
        name: "Zen Garden Shower Cream 2.1L",
        variant: "Goat's Milk",
        market: "Indonesia",
        familyId: "fam-1",
        family: { name: "Zen Garden Shower Cream 2.1L" },
      },
    ]);

    const result = await lookupListing(entering);

    expect(result).toEqual({
      success: true,
      data: { kind: "family", familyId: "fam-1", familyName: "Zen Garden Shower Cream 2.1L", members: 1 },
    });
  });

  it("narrows the read to the brand and the market", async () => {
    productFindMany.mockResolvedValue([]);
    await lookupListing(entering);
    expect(productFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { brand: "Zen Garden", market: "Indonesia" } }),
    );
  });

  it("says new when nothing matches", async () => {
    productFindMany.mockResolvedValue([]);
    await expect(lookupListing(entering)).resolves.toEqual({
      success: true,
      data: { kind: "new" },
    });
  });

  it("refuses anyone who is not a super admin", async () => {
    requireSuperAdmin.mockRejectedValue(new UnauthorizedError("This action needs super admin access."));
    const result = await lookupListing(entering);
    expect(result).toEqual({ success: false, error: "This action needs super admin access." });
    expect(productFindMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/actions/listings.test.ts`
Expected: FAIL — `Failed to resolve import "@/actions/listings"`.

- [ ] **Step 3: Write the action**

Create `src/actions/listings.ts`:

```ts
"use server";

import { UnauthorizedError, requireSuperAdmin } from "@/lib/auth-guards";
import { resolveListing, type ListingMatch } from "@/lib/listings";
import { listingCandidates } from "@/lib/queries/product-families";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Which listing the product on the form would join, for the line the create
 * page and the edit drawer print above the family picker (Phase 40).
 *
 * A read, and only a read. The write runs the same resolver again inside its
 * own transaction, because between this answer and the save another admin
 * may have created the family this said did not exist — so the line is
 * allowed to describe and never to promise.
 *
 * Super admin only, like every other product read that the ops room's own
 * 404 already covers: this one is reachable as a Server Action, so it is
 * checked here too.
 */
export async function lookupListing(input: {
  brand: string | null;
  name: string;
  variant: string | null;
  market: string | null;
  excludeId?: string;
}): Promise<ActionResult<ListingMatch>> {
  try {
    await requireSuperAdmin();
  } catch (cause) {
    return {
      success: false,
      error:
        cause instanceof UnauthorizedError ? cause.message : "You are not signed in.",
    };
  }

  try {
    const candidates = await listingCandidates({ brand: input.brand, market: input.market });
    return { success: true, data: resolveListing(input, candidates, input.excludeId) };
  } catch (cause) {
    console.error("[listings] lookupListing", cause);
    return { success: false, error: "We couldn't check the listings." };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/actions/listings.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Write `ListingNotice`**

Create `src/components/products/ListingNotice.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { lookupListing } from "@/actions/listings";
import type { ListingMatch } from "@/lib/listings";

/**
 * What happens to this product when it is saved (Phase 40).
 *
 * Before this, a reader could enter a second flavour of a product that was
 * already on the shop and be told nothing: the row landed in no family and
 * the card it joined was a coincidence of names. The line says which
 * listing is being joined, and the write then does exactly that — the same
 * resolver runs in both places.
 *
 * Debounced, because it runs as three fields are typed. 400 ms matches the
 * review screen's own draft save, which is the other place in this app that
 * calls a Server Action from a keystroke.
 */
const DEBOUNCE_MS = 400;

const caption = "text-[length:var(--text-caption)]";

export function ListingNotice({
  brand,
  name,
  variant,
  market,
  excludeId,
  chosenFamilyName = null,
}: {
  brand: string | null;
  name: string;
  variant: string | null;
  market: string | null;
  excludeId?: string;
  chosenFamilyName?: string | null;
}) {
  const [match, setMatch] = useState<ListingMatch | null>(null);

  useEffect(() => {
    // Nothing to look up until the product has a name; brand and market are
    // allowed to be null, and a listing keyed on "no brand, no market" is a
    // real one.
    if (!name.trim()) {
      setMatch(null);
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const result = await lookupListing({ brand, name, variant, market, excludeId });
      if (live && result.success) setMatch(result.data);
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [brand, name, variant, market, excludeId]);

  // A family the reader picked themselves overrides whatever the lookup
  // found; saying otherwise would contradict the control right below.
  if (chosenFamilyName) {
    return (
      <p className={`${caption} text-ink-secondary`}>
        Joins <strong className="font-semibold text-ink">{chosenFamilyName}</strong>, the
        family chosen below.
      </p>
    );
  }

  if (!match) return null;

  if (match.kind === "ambiguous") {
    return (
      <p className={`${caption} text-accent-red`}>
        This matches {match.families.length} listings —{" "}
        {match.families.map((family) => family.name).join(" and ")}. Choose a family
        below.
      </p>
    );
  }

  if (match.kind === "family") {
    return (
      <p className={`${caption} text-ink-secondary`}>
        Joins the existing listing{" "}
        <Link
          href={`/admin/catalogue/families/${match.familyId}`}
          className="font-semibold text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {match.familyName}
        </Link>{" "}
        ({match.members} {match.members === 1 ? "variant" : "variants"}).
      </p>
    );
  }

  if (match.kind === "derived") {
    return (
      <p className={`${caption} text-ink-secondary`}>
        Joins <strong className="font-semibold text-ink">{match.title}</strong> —{" "}
        {match.memberIds.length}{" "}
        {match.memberIds.length === 1 ? "product" : "products"} in no family yet.
        Saving puts all of them in one family.
      </p>
    );
  }

  return <p className={`${caption} text-ink-tertiary`}>This will be a new listing.</p>;
}
```

- [ ] **Step 6: Render it on both forms**

In `src/components/products/ProductForm.tsx`, inside the Family field's
container, directly **above** `<FamilyPicker …>`:

```tsx
<ListingNotice
  brand={form.brand ?? null}
  name={form.name}
  variant={rows[0]?.variant ?? null}
  market={form.market ?? null}
  chosenFamilyName={
    family.familyId
      ? (families.find((entry) => entry.id === family.familyId)?.name ?? null)
      : (family.draft?.name.trim() || null)
  }
/>
```

In `src/components/products/ProductSheet.tsx`, the same, above its
`<FamilyPicker …>`, with `excludeId={product.id}` and
`variant={form.variant ?? null}`.

Import `ListingNotice` in both.

- [ ] **Step 7: Verify in the browser**

The dev server is on `http://localhost:3000`; sign in as
`aisha@lovinghandsportal.com` / `Password123!`. On `/products/new`, enter a
brand, name and market matching an existing product and confirm the line
appears and names the listing; change the market and confirm it becomes "new
listing". **Do not submit** — this task has no cleanup budget. Report what you
read.

- [ ] **Step 8: Full suite, typecheck, lint, build, then commit**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`

```bash
git add src/actions/listings.ts src/actions/listings.test.ts src/components/products/ListingNotice.tsx src/components/products/ProductForm.tsx src/components/products/ProductSheet.tsx
git commit -m "$(cat <<'MSG'
feat(products): the form says which listing this product will join

A reader entering a second flavour of a product already on the shop used to
be told nothing. The line above the family picker names the listing being
joined, says when a group of unplaced products is about to become one
family, and refuses to choose when two listings match.

It describes and never promises: the write runs the same resolver again in
its own transaction, because a family can appear between the two.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: The code follows the product

**Files:**
- Modify: `src/lib/sku.ts`
- Test: `src/lib/sku.test.ts`
- Modify: `src/components/products/ProductSheet.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function isGeneratedSku(product: {
    sku: string; brand: string | null; category: string; name: string;
    variant: string | null; market: string | null; familyCode: string | null;
  }): boolean
  ```

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/sku.test.ts`, adding `isGeneratedSku` to its imports:

```ts
describe("isGeneratedSku", () => {
  const product = {
    brand: "Zen Garden",
    category: "Shower cream & gel",
    name: "Zen Garden Shower Cream 2.1L",
    variant: "Goat's Milk",
    market: "Indonesia",
    familyCode: "ZS-SC-2100",
  };

  it("recognises a code the family generator made", () => {
    const sku = generateVariantSku("ZS-SC-2100", { variant: "Goat's Milk", market: "Indonesia" });
    expect(isGeneratedSku({ ...product, sku })).toBe(true);
  });

  it("recognises a code the family-less generator made", () => {
    const sku = generateSku({
      brand: "Zen Garden",
      category: "Shower cream & gel",
      size: "2.1L",
      variant: "Goat's Milk",
      market: "Indonesia",
    });
    expect(isGeneratedSku({ ...product, familyCode: null, sku })).toBe(true);
  });

  it("refuses a customer's own printed code", () => {
    // The eight production rows carrying these are what this rule protects:
    // the purchase-order extraction matches lines to products by exact code.
    expect(isGeneratedSku({ ...product, sku: "ZEN/SC/2100/CARROT" })).toBe(false);
    expect(isGeneratedSku({ ...product, sku: "KE218441 68216" })).toBe(false);
  });

  it("refuses a hand-typed code that merely looks generated", () => {
    expect(isGeneratedSku({ ...product, sku: "ZS-SC-2100-GM" })).toBe(false);
  });

  it("compares through normaliseSku, so case and spacing do not decide it", () => {
    const sku = generateVariantSku("ZS-SC-2100", { variant: "Goat's Milk", market: "Indonesia" });
    expect(isGeneratedSku({ ...product, sku: sku.toLowerCase() })).toBe(true);
  });

  it("is false once the product's family is recoded", () => {
    // The safe side of the rule, recorded in the spec: the test recomputes
    // from the family's *current* code, so a rename turns an automatic
    // rewrite into an offered one.
    const sku = generateVariantSku("ZS-SC-2100", { variant: "Goat's Milk", market: "Indonesia" });
    expect(isGeneratedSku({ ...product, familyCode: "ZS-SC-2100-SCRUB", sku })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/sku.test.ts`
Expected: FAIL — `isGeneratedSku is not a function`.

- [ ] **Step 3: Write it**

Append to `src/lib/sku.ts`:

```ts
/**
 * Whether a product's code is one this module made (Phase 40).
 *
 * The edit drawer asks so it knows whether it may rewrite the code when the
 * variant, market or family changes. It recomputes what the code *would* be
 * from the product's current values and compares: equal means the generator
 * made it and may remake it; different means a person or a customer chose
 * it, and it is never rewritten without being asked.
 *
 * That difference is not cosmetic. Eight products on production carry the
 * customer's own printed codes — `ZEN/SC/2100/CARROT`, `KE218441 68216` —
 * and `resolveProducts` matches purchase-order lines to products by exact
 * code. Rewriting one silently would stop every future document matching
 * that line.
 */
export function isGeneratedSku(product: {
  sku: string;
  brand: string | null;
  category: string;
  name: string;
  variant: string | null;
  market: string | null;
  familyCode: string | null;
}): boolean {
  const generated = product.familyCode
    ? generateVariantSku(product.familyCode, {
        variant: product.variant,
        market: product.market,
      })
    : generateSku({
        brand: product.brand,
        category: product.category,
        size: sizeInName(product.name),
        variant: product.variant,
        market: product.market,
      });
  return normaliseSku(product.sku) === generated;
}
```

Add `import { normaliseSku } from "@/lib/validation/products";` if `sku.ts`
does not already import it. **Check for an import cycle first** — if
`validation/products.ts` imports from `sku.ts`, do not add the import; inline
the same normalisation (`value.trim().replace(/\s+/g, " ").toUpperCase()`) with
a comment saying why, and report the cycle.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/sku.test.ts`
Expected: PASS — 6 new tests.

- [ ] **Step 5: Teach the drawer**

`ProductSheet` needs the family's code to run the test. Its `families` prop
already carries `FamilyOption[]`, which has `code`.

Add, beside the existing state:

```ts
/**
 * Whether the SKU field follows the other fields, decided once from the
 * values the drawer opened with. A generated code may be regenerated; a
 * customer's or a hand-typed one is offered a button instead, never moved
 * on its own.
 */
const [skuFollows] = useState(() =>
  isGeneratedSku({
    sku: product.sku,
    brand: product.brand ?? null,
    category: product.category,
    name: product.name,
    variant: product.variant ?? null,
    market: product.market ?? null,
    familyCode: families.find((entry) => entry.id === product.familyId)?.code ?? null,
  }),
);
const [skuTouched, setSkuTouched] = useState(false);
```

Compute the proposal from the *current* form values, the way `ProductForm`
does:

```ts
const familyCode =
  families.find((entry) => entry.id === family.familyId)?.code ?? newFamily?.code ?? null;
const proposedSku = familyCode
  ? generateVariantSku(familyCode, { variant: form.variant ?? null, market: form.market ?? null })
  : generateSku({
      brand: form.brand ?? null,
      category: form.category,
      size: sizeInName(form.name),
      variant: form.variant ?? null,
      market: form.market ?? null,
    });

// A generated code follows the edit until the reader types in the field;
// any other code holds still and is offered the button below.
const sku = skuTouched || !skuFollows ? form.sku : proposedSku;
```

The SKU `<Input>` takes `value={sku}` and sets `skuTouched` on change, exactly
as `ProductForm`'s does. The submit sends `sku` rather than `form.sku`.

Under the field, replace the current caption with:

```tsx
{skuFollows || skuTouched ? (
  <p className="text-[length:var(--text-caption)] text-ink-tertiary">
    {skuTouched
      ? "Capitals, digits and dashes"
      : "Follows the family, variant and market — type to override"}
  </p>
) : proposedSku !== normaliseSku(form.sku) ? (
  <div className="flex flex-wrap items-center gap-xs">
    <p className="text-[length:var(--text-caption)] text-ink-tertiary">
      Not a generated code, so it stays as it is.
    </p>
    <button
      type="button"
      onClick={() => {
        setSkuTouched(true);
        set("sku", proposedSku);
      }}
      className="h-control-md rounded-pill border border-hairline-strong px-sm text-[length:var(--text-caption)] font-semibold text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:h-control-sm"
    >
      Regenerate → {proposedSku}
    </button>
  </div>
) : null}
```

- [ ] **Step 6: Verify in the browser**

On a product whose SKU equals its generated code, change the variant and watch
the SKU field follow. On one whose SKU does not — create the condition by
reading a product with a hand-shaped code, or temporarily by typing a code —
confirm the field holds and the Regenerate button appears with the code it
would take. **Do not save.** Report what you read, with the before and after
codes.

- [ ] **Step 7: Full suite, typecheck, lint, build, then commit**

```bash
git add src/lib/sku.ts src/lib/sku.test.ts src/components/products/ProductSheet.tsx
git commit -m "$(cat <<'MSG'
feat(products): the code follows the product, when the generator made it

The edit drawer's SKU was a plain text box: change the variant and the code
kept naming the old one. It now follows the family, variant and market — but
only for a code this module generated, decided once when the drawer opens by
recomputing and comparing.

A customer's printed code holds still and is offered a Regenerate button
instead. Eight production rows carry such codes and the purchase-order
extraction matches lines by exact code; rewriting one silently would stop
every future document matching that line.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: The admin listing page

**Files:**
- Modify: `src/actions/product-families.ts`
- Test: `src/actions/product-families.test.ts`
- Modify: `src/lib/queries/product-families.ts`
- Create: `src/app/(admin)/admin/catalogue/families/[id]/page.tsx`
- Create: `src/components/admin/ListingMembers.tsx`
- Create: `src/components/admin/AddProductToListing.tsx`
- Modify: `src/components/products/FamiliesList.tsx`

**Interfaces:**
- Produces:
  ```ts
  // src/actions/product-families.ts
  export async function addProductToFamily(productId: string, familyId: string): Promise<ActionResult>
  export async function removeProductFromFamily(productId: string): Promise<ActionResult>

  // src/lib/queries/product-families.ts
  export type ListingMember = {
    id: string; sku: string; name: string; variant: string | null;
    packSize: number | null; unit: string; market: string | null;
    listPrice: string; active: boolean;
  };
  export type Listing = {
    id: string; code: string; name: string; brand: string | null;
    category: string; size: string | null;
    markets: { market: string | null; members: ListingMember[] }[];
  };
  export async function loadListing(id: string): Promise<Listing | null>
  export async function productsOutsideFamily(familyId: string): Promise<
    { id: string; sku: string; name: string; brand: string | null; variant: string | null; market: string | null }[]
  >
  ```

- [ ] **Step 1: Write the failing action tests**

Append to `src/actions/product-families.test.ts` (create it following
`src/actions/products.test.ts`'s mock style if it does not exist):

```ts
describe("addProductToFamily", () => {
  beforeEach(() => {
    requireSuperAdmin.mockResolvedValue(admin);
    productUpdate.mockResolvedValue({ id: "prd-1" });
  });

  it("stamps the family on the product", async () => {
    const result = await addProductToFamily("prd-1", "fam-1");
    expect(result).toEqual({ success: true, data: undefined });
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: "prd-1" },
      data: { familyId: "fam-1" },
    });
  });

  it("refuses anyone who is not a super admin", async () => {
    requireSuperAdmin.mockRejectedValue(new UnauthorizedError("This action needs super admin access."));
    const result = await addProductToFamily("prd-1", "fam-1");
    expect(result).toEqual({ success: false, error: "This action needs super admin access." });
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it("says so when the product is gone", async () => {
    productUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("gone", { code: "P2025", clientVersion: "7" }),
    );
    const result = await addProductToFamily("prd-1", "fam-1");
    expect(result).toEqual({ success: false, error: "That product is gone." });
  });
});

describe("removeProductFromFamily", () => {
  beforeEach(() => {
    requireSuperAdmin.mockResolvedValue(admin);
    productUpdate.mockResolvedValue({ id: "prd-1" });
  });

  it("clears the family and leaves the product alone otherwise", async () => {
    const result = await removeProductFromFamily("prd-1");
    expect(result).toEqual({ success: true, data: undefined });
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: "prd-1" },
      data: { familyId: null },
    });
  });

  it("refuses anyone who is not a super admin", async () => {
    requireSuperAdmin.mockRejectedValue(new UnauthorizedError("This action needs super admin access."));
    expect(await removeProductFromFamily("prd-1")).toEqual({
      success: false,
      error: "This action needs super admin access.",
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/actions/product-families.test.ts`
Expected: FAIL — neither function is exported.

- [ ] **Step 3: Write the two actions**

In `src/actions/product-families.ts`, correct the module doc comment — it
currently says membership is not edited here, which stops being true — and
append:

```ts
/**
 * Membership, from the listing's own page (Phase 40).
 *
 * Phase 36 put this decision on the product's form on purpose: "which family
 * is this product in" was a judgement made while looking at the product. It
 * is now also a judgement made while looking at the *listing*, which is the
 * only place the whole set is visible, so both ends can make it.
 *
 * Neither of these deletes anything. A product removed from a family keeps
 * every column it had and returns to the grouping the shop derives from its
 * brand, name and market.
 */
export async function addProductToFamily(
  productId: string,
  familyId: string,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    await prisma.product.update({
      where: { id: productId },
      data: { familyId },
    });
    revalidate();
    revalidatePath(`/admin/catalogue/families/${familyId}`);
    return { success: true, data: undefined };
  } catch (cause) {
    if (missing(cause)) return { success: false, error: "That product is gone." };
    console.error("[families] addProductToFamily", cause);
    return { success: false, error: "We couldn't add that product." };
  }
}

export async function removeProductFromFamily(productId: string): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    const product = await prisma.product.update({
      where: { id: productId },
      data: { familyId: null },
      select: { familyId: true },
    });
    revalidate();
    return { success: true, data: undefined };
  } catch (cause) {
    if (missing(cause)) return { success: false, error: "That product is gone." };
    console.error("[families] removeProductFromFamily", cause);
    return { success: false, error: "We couldn't remove that product." };
  }
}
```

and beside `duplicate`:

```ts
const missing = (cause: unknown) =>
  cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2025";
```

The unused `product` binding in `removeProductFromFamily` will fail lint —
drop the assignment and the `select`, keeping the bare `await`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/actions/product-families.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the two reads**

In `src/lib/queries/product-families.ts`:

```ts
/**
 * One listing as the admin manages it: the family's own facts, and its
 * products grouped by market — because a family in two markets is two
 * listings on the shop, and the page has to show them as the buyer sees
 * them rather than as one undifferentiated list.
 *
 * Archived products are included. This is the screen where a hidden variant
 * is made visible again, so hiding one must not remove it from view.
 */
export async function loadListing(id: string): Promise<Listing | null> {
  const family = await prisma.productFamily.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      brand: true,
      category: true,
      size: true,
      products: {
        select: {
          id: true,
          sku: true,
          name: true,
          variant: true,
          packSize: true,
          unit: true,
          market: true,
          listPrice: true,
          active: true,
        },
        orderBy: [{ market: "asc" }, { variant: "asc" }, { sku: "asc" }],
      },
    },
  });
  if (!family) return null;

  const byMarket = new Map<string, { market: string | null; members: ListingMember[] }>();
  for (const product of family.products) {
    const key = product.market ?? "";
    let section = byMarket.get(key);
    if (!section) {
      section = { market: product.market, members: [] };
      byMarket.set(key, section);
    }
    section.members.push({ ...product, listPrice: product.listPrice.toFixed(2) });
  }

  const { products: _products, ...facts } = family;
  return { ...facts, markets: [...byMarket.values()] };
}

/** Candidates for "add a product": everything not already in this family. */
export async function productsOutsideFamily(familyId: string) {
  return prisma.product.findMany({
    where: { NOT: { familyId } },
    select: { id: true, sku: true, name: true, brand: true, variant: true, market: true },
    orderBy: { sku: "asc" },
    take: 500,
  });
}
```

Declare `ListingMember` and `Listing` above them, exactly as the Interfaces
block gives them.

- [ ] **Step 6: Write `ListingMembers`**

Create `src/components/admin/ListingMembers.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { removeProductFromFamily } from "@/actions/product-families";
import { setProductPublished } from "@/actions/products";
import { Button } from "@/components/ui/button";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { unitLabel } from "@/lib/cartons";
import { formatMYR } from "@/lib/money";
import type { ListingMember } from "@/lib/queries/product-families";

/**
 * One market's section of a listing — which is exactly one card on the shop
 * (Phase 40). Grouped by market rather than listed flat because a family in
 * two markets is two listings to a buyer, and an admin deciding what a card
 * offers has to see the card.
 *
 * Hiding a variant is `setProductPublished`, the same flag ops already uses
 * for "not on the shop"; removing one from the family returns it to derived
 * grouping. Neither deletes anything, and the page says so.
 */
export function ListingMembers({
  market,
  members,
}: {
  market: string | null;
  members: ListingMember[];
}) {
  const refresh = useAwaitableRefresh();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, work: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(id);
    const result = await work();
    if (!result.success) toast.error(result.error ?? "That didn't work.");
    await refresh();
    setBusy(null);
  };

  const shown = members.filter((member) => member.active).length;

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-md">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h3 className="text-[length:var(--text-heading-sm)] font-[650] text-ink">
          {market ?? "No market"}
        </h3>
        <p className="text-[length:var(--text-caption)] text-ink-tertiary">
          {shown} of {members.length} shown on the shop
        </p>
      </div>

      <ul className="mt-sm flex flex-col divide-y divide-hairline border-y border-hairline">
        {members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center gap-sm py-sm">
            <div className="min-w-0 flex-1">
              <Link
                href={`/products/${member.id}`}
                className="text-[length:var(--text-body-sm)] font-semibold text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {member.variant ?? "Standard"}
              </Link>
              <p className="font-mono text-[length:var(--text-caption)] text-ink-tertiary">
                {member.sku} · {unitLabel(member.packSize, member.unit)} ·{" "}
                {formatMYR(member.listPrice)}
              </p>
            </div>

            <span
              className={`rounded-pill px-sm py-xxs text-[length:var(--text-caption)] font-semibold ${
                member.active
                  ? "bg-surface-success text-ink"
                  : "bg-surface text-ink-secondary"
              }`}
            >
              {member.active ? "Shown" : "Hidden"}
            </span>

            <div className="flex items-center gap-xs">
              <Button
                type="button"
                variant="outline"
                pending={busy === member.id}
                onClick={() =>
                  run(member.id, () => setProductPublished(member.id, !member.active))
                }
                className="h-control-md px-md sm:h-control-sm"
              >
                {member.active ? "Hide from shop" : "Show"}
              </Button>
              <Button
                type="button"
                variant="outline"
                pending={busy === member.id}
                onClick={() => run(member.id, () => removeProductFromFamily(member.id))}
                className="h-control-md px-md sm:h-control-sm"
              >
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Check `Button`'s real variants and `setProductPublished`'s real signature
before writing; follow them if they differ.

- [ ] **Step 7: Write `AddProductToListing`**

Create `src/components/admin/AddProductToListing.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { addProductToFamily } from "@/actions/product-families";
import { Combobox } from "@/components/review/Combobox";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";

/**
 * Puts an existing product into this listing (Phase 40). Searchable by SKU
 * or name, because the reader is looking for a row they know exists, not
 * browsing.
 */
export function AddProductToListing({
  familyId,
  candidates,
}: {
  familyId: string;
  candidates: {
    id: string;
    sku: string;
    name: string;
    brand: string | null;
    variant: string | null;
    market: string | null;
  }[];
}) {
  const refresh = useAwaitableRefresh();
  const [pending, setPending] = useState(false);

  const options = candidates.map((product) => ({
    id: product.id,
    label: `${product.sku} · ${product.name}`,
    hint: [product.brand, product.variant, product.market].filter(Boolean).join(" · "),
  }));

  return (
    <div className="flex flex-col gap-xxs">
      <span className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Add a product
      </span>
      <Combobox
        ariaLabel="Add a product to this listing"
        value={null}
        placeholder={pending ? "Adding…" : "Search by SKU or name"}
        options={options}
        onSelect={async (option) => {
          setPending(true);
          const result = await addProductToFamily(option.id, familyId);
          if (!result.success) toast.error(result.error);
          await refresh();
          setPending(false);
        }}
      />
      <p className="text-[length:var(--text-caption)] text-ink-tertiary">
        It joins the market section its own market names.
      </p>
    </div>
  );
}
```

- [ ] **Step 8: Write the page**

Create `src/app/(admin)/admin/catalogue/families/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AddProductToListing } from "@/components/admin/AddProductToListing";
import { ListingMembers } from "@/components/admin/ListingMembers";
import { Rise } from "@/components/portal/Rise";
import { loadListing, productsOutsideFamily } from "@/lib/queries/product-families";

export const metadata: Metadata = { title: "Listing · Zen Garden Portal" };
export const dynamic = "force-dynamic";

/**
 * One listing, as the buyer meets it (Phase 40).
 *
 * A family in one market is one card on the shop, so this page is sectioned
 * by market: each section is a card, and what it holds is what that card
 * offers. Before this there was nowhere to see a listing whole — membership
 * could only be read and changed one product at a time, from the product.
 */
export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [listing, candidates] = await Promise.all([
    loadListing(id),
    productsOutsideFamily(id),
  ]);
  if (!listing) notFound();

  const variants = listing.markets.reduce((sum, section) => sum + section.members.length, 0);

  return (
    <>
      <Rise index={0} className="mb-lg">
        <Link
          href="/admin/catalogue"
          className="text-[length:var(--text-caption)] text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          ← Catalogue
        </Link>
        <p className="mt-xs font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          {listing.code}
          {listing.brand ? ` · ${listing.brand}` : ""} · {listing.category}
          {listing.size ? ` · ${listing.size}` : ""}
        </p>
        <h1 className="font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink">
          {listing.name}
        </h1>
        <p className="mt-xxs max-w-[62ch] text-[length:var(--text-body-sm)] text-ink-secondary">
          {variants} {variants === 1 ? "variant" : "variants"} across{" "}
          {listing.markets.length}{" "}
          {listing.markets.length === 1 ? "market" : "markets"}. Each market is one
          card on the shop; hiding a variant takes it off that card without
          deleting it.
        </p>
      </Rise>

      <div className="flex flex-col gap-lg">
        {listing.markets.map((section, index) => (
          <Rise key={section.market ?? ""} index={index + 1} className="min-w-0">
            <ListingMembers market={section.market} members={section.members} />
          </Rise>
        ))}

        <Rise index={listing.markets.length + 1} className="min-w-0">
          <section className="rounded-lg border border-hairline bg-canvas p-md">
            <AddProductToListing familyId={listing.id} candidates={candidates} />
          </section>
        </Rise>
      </div>
    </>
  );
}
```

- [ ] **Step 9: Point the families table at it, and show the markets**

In `src/components/products/FamiliesList.tsx`, change `rowHref` to

```ts
      rowHref={(row) => `/admin/catalogue/families/${row.id}`}
```

except for the `NO_FAMILY` remainder row, which has no page — read how that row
is rendered and leave its link as it is, or give it none.

Add a Markets column beside Variants, reading `row.markets`, which
`groupFamilies` already computes.

- [ ] **Step 10: Verify in the browser**

Sign in as a super admin. Open `/admin/catalogue`, click a family, and confirm
the page renders a section per market with the right variants; Hide, Show,
Remove and Add each work and the page reflects them. Confirm a **MEMBER** gets
the room's 404. Report what you read. **Undo anything you change** — note the
product ids and restore their `familyId` and `active`.

- [ ] **Step 11: Full suite, typecheck, lint, build, then commit**

```bash
git add src/actions/product-families.ts src/actions/product-families.test.ts src/lib/queries/product-families.ts "src/app/(admin)/admin/catalogue/families/[id]/page.tsx" src/components/admin/ListingMembers.tsx src/components/admin/AddProductToListing.tsx src/components/products/FamiliesList.tsx
git commit -m "$(cat <<'MSG'
feat(admin): a page per listing, sectioned by market

A family in one market is one card on the shop, so the page shows one
section per market and what each card offers. Membership could only be read
and changed one product at a time before, from the product; it can now also
be decided while looking at the whole set.

Hide takes a variant off its card through the flag ops already uses; Remove
returns a product to derived grouping. Neither deletes anything.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: Drive it, prove it, record it

**Files:**
- Modify: `docs/specs/40-product-listings.md` (§8 rewritten as measured)
- Modify: `context/current-feature.md`

No code changes unless this task finds a defect — in which case fix it here and
record it rather than deferring.

- [ ] **Step 1: Read the baseline**

Before touching anything, record `product`, `productFamily`, `productImage`,
`productPrice`, `webOrder`, `purchaseOrder`, `user` and `catalogLabel` counts
with a throwaway script in the scratchpad. Phase 39's cleanup returned the
development database to 308 products / 59 families / 400 purchase orders / 0
web orders / 2 users — **confirm rather than assume.**

Maintain a cleanup ledger from the first row you create, ids collected as you
go, never by wildcard.

- [ ] **Step 2: Promote the dev member**

`scripts/grant-super-admin.ts` on `aisha@lovinghandsportal.com`; record the
previous role and revert it at the end, reading the row back.

- [ ] **Step 3: Drive the twelve criteria**

Work through `docs/specs/40-product-listings.md` §8 in order, measuring rather
than asserting. The two that matter most, because only reasoning covers them:

- **Criterion 4** — create a product matching a derived group of two unplaced
  products; confirm `productFamily.count()` rises by exactly one and **all
  three** rows share the new `familyId`, read from the database.
- **Criterion 9** — the SKU rule, both ways, with the before and after codes.

- [ ] **Step 4: The sweep**

`/admin/catalogue/families/[id]`, `/products/new` with the listing line, and a
shop card whose listing mixes pack sizes, at 390 / 768 / 1440. Assert
`scrollWidth === innerWidth` on all nine. At 390 list every interactive element
under 44px and check it against the accepted classes in
`context/current-feature.md`; anything new is a defect to report. Console: 0
errors.

- [ ] **Step 5: Clean up, counted both ends**

Delete everything by id, revert the role and read it back, re-run the baseline
script and show the counts returning. Remove every temporary script.

- [ ] **Step 6: Record what happened**

Rewrite the spec's §8 as what was measured, with figures. Update
`context/current-feature.md`: Phase 40 as the current feature, what was
verified with numbers, and **what was not** — production in particular, where
this has never been deployed, the families do not exist, and the backfill of
§7 has not run.

- [ ] **Step 7: Final verification and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Report the test count and lint's figures.

```bash
git add context/current-feature.md docs/specs/40-product-listings.md
git commit -m "$(cat <<'MSG'
docs: phase 40 verified in the browser, with the figures

Records what was measured rather than what was intended, and says plainly
what was not: nothing on production, where no family exists and the §7
backfill has not run.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Self-Review

**Spec coverage.**

| Spec section | Task |
|---|---|
| §2 the key (pack size out, market in) | Task 1, Task 2 |
| §3 labels carry only what differs | Task 1 |
| §4 the resolver | Task 3 |
| §4 the forms' message | Task 5 |
| §4 the writes | Task 4 |
| §5 the admin listing page | Task 7 |
| §6 the code follows the product | Task 6 |
| §7 production backfill | Task 8 step 6 records it; the run itself is an operations step, not a code task |
| §8 criteria 1–12 | Task 8 |
| §10 known | Task 8 step 6 |

**Type consistency.** `derivedKey` (Task 1) is what `resolveListing` (Task 3)
keys on. `ListingMatch` is produced in Task 3, returned by `lookupListing`
(Task 5) and consumed by `joinListing` (Task 4) and `ListingNotice` (Task 5).
`listingCandidates` (Task 4) returns `ListingCandidate[]` from Task 3 and takes
an optional transaction client, which is what lets Task 4's batch see its own
rows. `ListingMember`/`Listing` (Task 7) are the admin page's own types and
cross to no other task. `isGeneratedSku` (Task 6) is called only by
`ProductSheet`.

**Known risks, stated rather than discovered.**

1. **Task 4's `joinListing` runs one `findMany` per write.** For a
   24-variant batch it runs once, not 24 times, because it is called before
   the variant loop — confirm that when implementing; calling it inside the
   loop would be a defect.
2. **`listingCandidates` reads every product of a brand in a market** — on
   production's largest brand that is tens of rows, not hundreds. If it
   proves slow, the fix is a `name` prefix filter, not a cache.
3. **Task 1 breaks `shop-catalogue.test.ts` until Task 2 lands.** That is
   expected and stated in Task 1 step 7; do not "fix" it by adjusting Task 1.

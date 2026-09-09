# Product Matching at Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reviewer chooses the catalogue product for every line of a purchase order before Confirm unlocks, each line arriving with ranked suggestions, a confidence score, and the market that separates two otherwise identical products.

**Architecture:** Scoring is one pure module (`match-products.ts`) with no I/O, so it is unit-tested against the codes production actually holds. Extraction does only the conclusive half — an exact code match, no writes. The review screen ships the catalogue to the client and ranks candidates reactively, so editing a printed code re-ranks live. `confirmPurchaseOrder` stops re-deriving `productId` and honours the stored decision, creating `"new"` products inside its existing transaction.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Zod 4, Prisma 7 on Neon, Tailwind v4, Vitest.

**Spec:** `docs/specs/12-product-matching.md`

## Global Constraints

- Branch is `feature/product-matching`, already created and holding the spec commit. Do not branch again.
- **Tests are Vitest, node environment, `src/**/*.test.{ts,tsx}`.** There are 39 test files and **zero component tests** — no jsdom, no testing-library, no `@vitejs/plugin-react` DOM setup in use. **Do not add a component-test harness.** UI is verified in a browser, which is this project's established practice.
- Run tests with `npm test`, lint with `npm run lint`, build with `npm run build`.
- **No `any`.** TypeScript strict. Define interfaces for props and returns.
- **Tailwind v4 only.** Tokens from `@theme` in `src/app/globals.css`. Never a raw hex, a px font size, or an arbitrary value like `text-[15px]`. If a token is missing, add it to `@theme` first.
- Money crosses boundaries as a **string**, compared as `Prisma.Decimal`. Never a float.
- Server Actions return `{ success, data } | { success, error }`.
- Sentence-case UI labels (`00-master.md` §4).
- **Do not commit without the build passing.** Conventional commit messages. Never the words "Generated with Claude" in a message. End every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **No migration is needed anywhere in this plan.** `LineItem.productId` already exists and `Extraction.draftJson` is JSON. If you find yourself writing a migration, stop — you have misread the plan.

---

### Task 1: `productDecision` on the draft

**Files:**
- Modify: `src/lib/validation/purchase-orders.ts:30-45` (`DraftLineItemSchema`)
- Modify: `src/components/review/draft-reducer.ts:4-19` (actions and `EMPTY_LINE`)
- Test: `src/lib/validation/purchase-orders.test.ts` (create if absent)
- Test: `src/components/review/draft-reducer.test.ts` (exists)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `PRODUCT_DECISIONS`, `type ProductDecision = "unset" | "linked" | "new" | "none"`, the `productDecision` key on `DraftLineItem`, and the reducer action `{ type: "decision"; index: number; decision: ProductDecision; productId: string | null }`.

Why this shape: `"unset"` is the default so the two drafts already sitting in the review queue parse as undecided, which is correct — they were never reviewed under this rule. `"none"` is real capability, not tidying: POs carry freight and discount lines, which today land as `productId: null` indistinguishably from "nobody looked".

- [ ] **Step 1: Write the failing tests**

Create `src/lib/validation/purchase-orders.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DraftLineItemSchema } from "@/lib/validation/purchase-orders";

const line = (over: Record<string, unknown> = {}) => ({
  sku: null,
  description: "Zen shower cream 2.1L",
  quantity: "1",
  unit: null,
  unitPrice: "10.00",
  amount: "10.00",
  ...over,
});

describe("DraftLineItemSchema — productDecision", () => {
  it("defaults to unset, so a draft written before this phase must be reviewed", () => {
    const parsed = DraftLineItemSchema.parse(line());
    expect(parsed.productDecision).toBe("unset");
  });

  it("rejects a linked line with no product, which would point at nothing", () => {
    const parsed = DraftLineItemSchema.safeParse(
      line({ productDecision: "linked", productId: null }),
    );
    expect(parsed.success).toBe(false);
  });

  it("accepts a linked line carrying its product", () => {
    const parsed = DraftLineItemSchema.safeParse(
      line({ productDecision: "linked", productId: "prd1" }),
    );
    expect(parsed.success).toBe(true);
  });

  it("accepts new and none without a product", () => {
    for (const productDecision of ["new", "none"] as const) {
      expect(
        DraftLineItemSchema.safeParse(line({ productDecision })).success,
      ).toBe(true);
    }
  });
});
```

Append to `src/components/review/draft-reducer.test.ts`:

```ts
describe("draftReducer — decision", () => {
  it("records the reviewer's choice and its product", () => {
    const state = draftReducer(base(), {
      type: "decision",
      index: 0,
      decision: "linked",
      productId: "prd1",
    });
    expect(state.lineItems[0].productDecision).toBe("linked");
    expect(state.lineItems[0].productId).toBe("prd1");
  });

  it("clears the product when the line is not a product", () => {
    const linked = draftReducer(base(), {
      type: "decision",
      index: 0,
      decision: "linked",
      productId: "prd1",
    });
    const state = draftReducer(linked, {
      type: "decision",
      index: 0,
      decision: "none",
      productId: null,
    });
    expect(state.lineItems[0].productId).toBeNull();
  });

  it("keeps a decision when the printed code is edited — the code is what the document says, not what the reviewer decided", () => {
    const linked = draftReducer(base(), {
      type: "decision",
      index: 0,
      decision: "linked",
      productId: "prd1",
    });
    const state = draftReducer(linked, {
      type: "line",
      index: 0,
      field: "sku",
      value: "ZEN-SC-2100-GM-VN",
    });
    expect(state.lineItems[0].productDecision).toBe("linked");
    expect(state.lineItems[0].productId).toBe("prd1");
  });
});
```

`base()` is a `PoDraft` factory. If the existing test file has one under another name, reuse it rather than adding a second.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/validation/purchase-orders.test.ts src/components/review/draft-reducer.test.ts`
Expected: FAIL — `productDecision` is not a key, and the reducer has no `decision` action.

- [ ] **Step 3: Add the field**

In `src/lib/validation/purchase-orders.ts`, replace the `DraftLineItemSchema` declaration. Keep every existing key and comment; only the wrapper and the new field are new:

```ts
export const PRODUCT_DECISIONS = ["unset", "linked", "new", "none"] as const;
export type ProductDecision = (typeof PRODUCT_DECISIONS)[number];

/**
 * Split from the exported schema so the object stays a `ZodObject` — a
 * `.superRefine` returns a checked schema that no longer offers `.extend`
 * or `.shape`.
 */
const DraftLineItemFields = z.object({
  sku: z.string().nullable(),
  description: z.string().min(1, "Describe the line"),
  productId: z.string().nullable().optional(),
  quantity: decimalString("Quantity"),
  unit: z.string().nullable(),
  unitPrice: decimalString("Unit price"),
  amount: decimalString("Amount"),
  amountManual: z.boolean().optional(),
  /**
   * What the reviewer decided this line is. "unset" blocks Confirm — the
   * whole point of the field is that a person looked. Defaulted rather than
   * required so drafts written before this phase parse as undecided, which
   * is exactly right: they were never reviewed under this rule.
   */
  productDecision: z.enum(PRODUCT_DECISIONS).default("unset"),
});

export const DraftLineItemSchema = DraftLineItemFields.superRefine(
  (line, ctx) => {
    if (line.productDecision === "linked" && !line.productId) {
      ctx.addIssue({
        code: "custom",
        message: "Choose a product for every line",
        path: ["productId"],
      });
    }
  },
);
```

Keep the existing doc comments on `sku`, `productId` and `amountManual` — copy them across. Update the `sku` comment, which now describes behaviour this phase removes:

```ts
  /**
   * The product code as printed on the document, stored on the line and shown
   * on the PO detail screen. Since Phase 12 it no longer *decides* the link:
   * `productDecision` does. Editing it re-ranks the suggestions, nothing more.
   */
```

- [ ] **Step 4: Add the reducer action**

In `src/components/review/draft-reducer.ts`, extend the union:

```ts
  | {
      type: "decision";
      index: number;
      decision: ProductDecision;
      productId: string | null;
    }
```

Import `ProductDecision` alongside the existing types. Add `productDecision: "unset"` to `EMPTY_LINE`. Add the case:

```ts
    case "decision": {
      const lineItems = state.lineItems.map((line, index) =>
        index === action.index
          ? {
              ...line,
              productDecision: action.decision,
              // Only a linked line carries a product; "new" and "none" must
              // not leave a stale id behind for confirm to pick up.
              productId: action.decision === "linked" ? action.productId : null,
            }
          : line,
      );
      return { ...state, lineItems };
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/validation/purchase-orders.test.ts src/components/review/draft-reducer.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck the whole app**

Run: `npx tsc --noEmit`
Expected: errors only where `DraftLineItem` is constructed without `productDecision` — `src/lib/extraction/run.ts` and `src/app/(portal)/review/[id]/page.tsx`. Add `productDecision: "unset"` at both construction sites and re-run until clean. Do not change their behaviour otherwise; later tasks own those files.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validation/purchase-orders.ts src/lib/validation/purchase-orders.test.ts src/components/review/draft-reducer.ts src/components/review/draft-reducer.test.ts src/lib/extraction/run.ts "src/app/(portal)/review/[id]/page.tsx"
git commit -m "feat: a purchase order line carries an explicit product decision

unset is the default, so the drafts already in the review queue read as
undecided — they were never reviewed under this rule. none is new
capability: POs carry freight and discount lines that today land as
productId null, indistinguishable from nobody having looked.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The scorer

**Files:**
- Create: `src/lib/extraction/match-products.ts`
- Test: `src/lib/extraction/match-products.test.ts`

**Interfaces:**
- Consumes: `normaliseSku` from `@/lib/validation/products`.
- Produces:
  - `type CatalogueEntry = { id: string; sku: string; name: string; brand: string | null; variant: string | null; market: string | null; packSize: number | null; unit: string }`
  - `type MatchableLine = { description: string; sku: string | null }`
  - `type Candidate = { productId: string; score: number }`
  - `type Idf = (token: string) => number`
  - `tokenise(value: string): string[]`
  - `parseSize(value: string): number | null`
  - `buildIdf(catalogue: CatalogueEntry[]): Idf`
  - `scoreLine(line: MatchableLine, entry: CatalogueEntry, idf: Idf): number`
  - `matchLine(line: MatchableLine, catalogue: CatalogueEntry[], idf: Idf): Candidate[]`
  - `SUGGEST_MIN = 45`, `STRONG_MATCH = 85`

**This module imports no Prisma, does no I/O, and has no `async`.** That is what makes it testable against real production strings.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/extraction/match-products.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildIdf,
  matchLine,
  parseSize,
  scoreLine,
  tokenise,
  STRONG_MATCH,
  SUGGEST_MIN,
  type CatalogueEntry,
} from "@/lib/extraction/match-products";

const entry = (over: Partial<CatalogueEntry> & { id: string }): CatalogueEntry => ({
  sku: "ZEN-SC-2100-GM-VN",
  name: "Zen Garden shower cream 2.1L goat's milk",
  brand: "ZEN GARDEN",
  variant: "Goat's Milk",
  market: "Vietnam",
  packSize: 6,
  unit: "carton",
  ...over,
});

describe("tokenise", () => {
  it("treats a period as a separator, so a smushed code keeps its words", () => {
    // sku.ts strips "." so that Goat's becomes goats. Applied to a code that
    // yields "rjelly2lt" and the distinctive token "jelly" is lost.
    expect(tokenise("ZENSC-R.JELLY2LT")).toEqual(["zensc", "r", "jelly", "2", "lt"]);
  });

  it("still strips an apostrophe, so Goat's and Goats are one token", () => {
    expect(tokenise("Goat's Milk")).toEqual(["goats", "milk"]);
  });
});

describe("parseSize", () => {
  it.each([
    ["2.1L", 2100],
    ["500ML", 500],
    ["2.9KG", 2900],
    ["60ML", 60],
    ["ZENSC-R.JELLY2LT", 2000],
    ["EVERFRESH B SHAMPOO LVD& CHAMOMILE 2.1L", 2100],
  ])("reads %s as %i", (input, expected) => {
    expect(parseSize(input)).toBe(expected);
  });

  it("does not read GM as grams — that is Goat's Milk", () => {
    expect(parseSize("ZEN-SC-2100-GM-VN")).toBeNull();
  });

  it("has no size to read in a plain description", () => {
    expect(parseSize("Shower cream")).toBeNull();
  });
});

describe("scoreLine — the identity branch", () => {
  const idf = buildIdf([entry({ id: "p1" })]);

  it("scores an exact code 100", () => {
    expect(
      scoreLine({ description: "anything", sku: "zen-sc-2100-gm-vn" }, entry({ id: "p1" }), idf),
    ).toBe(100);
  });

  it("scores a code differing only in separators 96", () => {
    expect(
      scoreLine(
        { description: "", sku: "ZEN/SC/2100/CARROT" },
        entry({ id: "p1", sku: "ZEN.SC.2100.CARROT" }),
        idf,
      ),
    ).toBe(96);
  });

  it("survives a code carrying a space", () => {
    expect(
      scoreLine(
        { description: "", sku: "KE218441 68216" },
        entry({ id: "p1", sku: "KE218441 68216" }),
        idf,
      ),
    ).toBe(100);
  });

  it("scores an exact name 92 when no code is printed", () => {
    expect(
      scoreLine(
        { description: "Zen Garden shower cream 2.1L goat's milk", sku: null },
        entry({ id: "p1" }),
        idf,
      ),
    ).toBe(92);
  });

  it("never reaches 96 for codes that differ by more than separators", () => {
    // CARROT and CR are different strings. This pair is real — production
    // holds both — and it belongs to the similarity branch, not identity.
    const score = scoreLine(
      { description: "", sku: "ZEN/SC/2100/CARROT" },
      entry({ id: "p1", sku: "ZEN-SC-2100-CR", variant: "Carrot", name: "Zen Garden shower cream 2.1L carrot" }),
      idf,
    );
    expect(score).toBeLessThan(96);
  });
});

describe("scoreLine — size", () => {
  const catalogue = [
    entry({ id: "big", name: "Everfresh B shampoo lavender & chamomile 2.1L", sku: "EVF-HC-2100-LV-MY", brand: "Everfresh", variant: "Lavender" }),
    entry({ id: "small", name: "Everfresh B shampoo lavender & chamomile 500ML", sku: "EVF-HC-0500-LV-MY", brand: "Everfresh", variant: "Lavender" }),
  ];
  const idf = buildIdf(catalogue);
  const line = { description: "EVERFRESH B SHAMPOO LVD& CHAMOMILE 2.1L", sku: null };

  it("scores the matching size above the mismatched one", () => {
    expect(scoreLine(line, catalogue[0], idf)).toBeGreaterThan(
      scoreLine(line, catalogue[1], idf),
    );
  });

  it("caps a size mismatch at 40 however much wording agrees", () => {
    // These two share every word they have. Without the cap, token overlap
    // alone ranks the wrong size first and misprices the order.
    expect(scoreLine(line, catalogue[1], idf)).toBeLessThanOrEqual(40);
  });
});

describe("scoreLine — a generic description against a crowded catalogue", () => {
  it("reaches no strong match, because four of its words are shared by everything", () => {
    const catalogue = Array.from({ length: 200 }, (_, i) =>
      entry({
        id: `p${i}`,
        sku: `ZEN-SC-2100-V${i}`,
        name: `Zen Garden shower cream 2.1L variant ${i}`,
        variant: `Variant ${i}`,
      }),
    );
    const idf = buildIdf(catalogue);
    const line = { description: "ZEN GARDEN SHOWER CREAM", sku: null };
    for (const candidate of catalogue) {
      expect(scoreLine(line, candidate, idf)).toBeLessThan(STRONG_MATCH);
    }
  });
});

describe("scoreLine — a smushed code", () => {
  it("ranks its royal-jelly row above every other shower cream", () => {
    const catalogue = [
      entry({ id: "jelly", sku: "ZEN-SC-2000-RJ-MY", name: "Zen shower cream royal jelly 2L", variant: "Royal Jelly" }),
      entry({ id: "milk", sku: "ZEN-SC-2000-GM-MY", name: "Zen shower cream goat's milk 2L", variant: "Goat's Milk" }),
      entry({ id: "lav", sku: "ZEN-SC-2000-LV-MY", name: "Zen shower cream lavender 2L", variant: "Lavender" }),
    ];
    const idf = buildIdf(catalogue);
    const line = { description: "", sku: "ZENSC-R.JELLY2LT" };
    const scores = catalogue.map((c) => scoreLine(line, c, idf));
    expect(Math.max(...scores)).toBe(scores[0]);
    expect(scores[0]).toBeGreaterThan(scores[1]);
  });
});

describe("buildIdf", () => {
  it("weights a rare token above a ubiquitous one", () => {
    const catalogue = [
      entry({ id: "a", name: "Zen shower cream chamomile", variant: "Chamomile" }),
      entry({ id: "b", name: "Zen shower cream lavender", variant: "Lavender" }),
      entry({ id: "c", name: "Zen shower cream lemon", variant: "Lemon" }),
    ];
    const idf = buildIdf(catalogue);
    expect(idf("chamomile")).toBeGreaterThan(idf("shower"));
    expect(idf("shower")).toBe(0);
  });
});

describe("matchLine", () => {
  // Distinct variant words on purpose. Numbered variants ("Chamomile 1",
  // "Chamomile 2") share every distinctive token, so every candidate falls
  // below SUGGEST_MIN and the assertions below pass against an empty array
  // while proving nothing.
  const VARIANTS = ["chamomile", "lavender", "lemon", "carrot", "avocado", "collagen"];
  const catalogue = VARIANTS.map((variant, i) =>
    entry({
      id: `p${i}`,
      sku: `ZEN-SC-2100-V${i}`,
      name: `Zen Garden shower cream 2.1L ${variant}`,
      variant,
    }),
  );
  const idf = buildIdf(catalogue);

  it("returns nothing for a line with no description and no code", () => {
    expect(matchLine({ description: "   ", sku: null }, catalogue, idf)).toEqual([]);
  });

  it("ranks the variant the line names first, and offers at most five", () => {
    const found = matchLine(
      { description: "Zen Garden shower cream 2.1L lemon", sku: null },
      catalogue,
      idf,
    );
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThanOrEqual(5);
    expect(found[0].productId).toBe("p2");
    expect(found).toEqual([...found].sort((a, b) => b.score - a.score));
  });

  it("offers nothing below the suggestion threshold", () => {
    const found = matchLine({ description: "delivery charge", sku: null }, catalogue, idf);
    expect(found.every((c) => c.score >= SUGGEST_MIN)).toBe(true);
  });

  it("offers both of two products differing only by market, scoring equally", () => {
    const pair = [
      entry({ id: "my", sku: "ZEN-SC-2100-GM-MY", market: "Malaysia" }),
      entry({ id: "vn", sku: "ZEN-SC-2100-GM-VN", market: "Vietnam" }),
    ];
    const pairIdf = buildIdf(pair);
    const found = matchLine(
      { description: "Zen Garden shower cream 2.1L goat's milk", sku: null },
      pair,
      pairIdf,
    );
    expect(found).toHaveLength(2);
    expect(found[0].score).toBe(found[1].score);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/extraction/match-products.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the module**

Create `src/lib/extraction/match-products.ts`:

```ts
import { normaliseSku } from "@/lib/validation/products";

/** Below this, no candidate is offered at all. */
export const SUGGEST_MIN = 45;
/** At or above, the chip reads green. */
export const STRONG_MATCH = 85;

const MAX_CANDIDATES = 5;
const OVERLAP_CEILING = 85;
const SIMILARITY_CEILING = 90;
const SIZE_MISMATCH_CEILING = 40;
const SIZE_AGREES = 18;
const BRAND_AGREES = 8;
const VARIANT_AGREES = 10;

export type CatalogueEntry = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  variant: string | null;
  market: string | null;
  packSize: number | null;
  unit: string;
};

export type MatchableLine = { description: string; sku: string | null };
export type Candidate = { productId: string; score: number };
export type Idf = (token: string) => number;

/**
 * Close to `sku.ts`'s `normalise()` but deliberately not it, in two ways that
 * matter for the codes customers actually print:
 *
 * - A period is a separator, not a deletion. `sku.ts` strips "." so that
 *   Goat's becomes goats; applied to ZENSC-R.JELLY2LT that yields
 *   "rjelly2lt" and the distinctive token "jelly" is lost.
 * - A letter/digit boundary splits, so JELLY2LT gives jelly, 2, lt.
 */
const normaliseText = (value: string) =>
  value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const tokenise = (value: string): string[] =>
  normaliseText(value).split(" ").filter(Boolean);

/** The code with every separator removed: the 96 tier compares these. */
const bareSku = (value: string) => normaliseSku(value).replace(/[^A-Z0-9]/g, "");

// LT before L, ML before M-anything, KG before G: alternation is ordered.
// The trailing guard stops "GM" (Goat's Milk) reading as grams.
const SIZE_PATTERN = /(\d+(?:\.\d+)?)\s*(ML|LT|L|KG|G)(?![A-Z])/g;

/** "2.1L" → 2100, "500ML" → 500. Litres and kilograms become ml and g. */
export function parseSize(value: string): number | null {
  for (const match of value.toUpperCase().matchAll(SIZE_PATTERN)) {
    const amount = Number(match[1]);
    const unit = match[2];
    const base = unit === "L" || unit === "LT" || unit === "KG" ? amount * 1000 : amount;
    if (base > 0 && base <= 25000) return base;
  }
  return null;
}

/**
 * The size segment of a generated code — ZEN-SC-2100-GM-VN → 2100 — for
 * products whose name does not print one. The range guard is what stops a
 * code like "KE218441 68216" contributing a nonsense size and earning a
 * false mismatch penalty against everything.
 */
const SKU_SIZE_SEGMENT = /(?:^|[^0-9A-Z])(\d{3,5})(?:[^0-9A-Z]|$)/;

function skuSize(sku: string): number | null {
  const match = normaliseSku(sku).match(SKU_SIZE_SEGMENT);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 30 && value <= 25000 ? value : null;
}

const entrySize = (entry: CatalogueEntry) => parseSize(entry.name) ?? skuSize(entry.sku);

const lineSize = (line: MatchableLine) =>
  parseSize(line.description) ??
  (line.sku ? (parseSize(line.sku) ?? skuSize(line.sku)) : null);

/**
 * The words a product is known by. The code is deliberately absent: it is
 * handled conclusively by the identity branch, and its segments (gm, vn)
 * would otherwise inflate the union and depress every description-only line.
 */
const entryTokens = (entry: CatalogueEntry) =>
  tokenise([entry.name, entry.brand ?? "", entry.variant ?? ""].join(" "));

/**
 * Inverse document frequency over the catalogue.
 *
 * Production holds 309 products and most of their names open with the same
 * words. A plain overlap score gives "ZEN GARDEN SHOWER CREAM 2.1L GOAT'S
 * MILK" a strong match against every shower cream, because four of its six
 * tokens are shared by two hundred rows. Weighting by log(N / rows holding
 * the token) makes CHAMOMILE count for far more than ZEN — and makes a token
 * every product shares count for exactly nothing.
 *
 * Built once per document, never once per line.
 */
export function buildIdf(catalogue: CatalogueEntry[]): Idf {
  const docs = Math.max(catalogue.length, 1);
  const counts = new Map<string, number>();
  for (const entry of catalogue) {
    for (const token of new Set(entryTokens(entry))) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  // A token no product uses is maximally distinctive, not unweighted.
  const unknown = Math.log(docs + 1);
  return (token) => {
    const seen = counts.get(token);
    return seen === undefined ? unknown : Math.log(docs / seen);
  };
}

/**
 * How strongly one line points at one product, 0–100.
 *
 * Two branches, and which one applies is decided first. The identity branch
 * is conclusive and takes no adjustment. The similarity branch is clamped to
 * 90, so a wording match can never reach the 92 an exact name earns — a
 * suggestion cannot impersonate the Phase 11 exact rule however many tokens
 * happen to line up.
 */
export function scoreLine(
  line: MatchableLine,
  entry: CatalogueEntry,
  idf: Idf,
): number {
  const lineSku = line.sku ? normaliseSku(line.sku) : "";
  if (lineSku) {
    if (lineSku === normaliseSku(entry.sku)) return 100;
    const bare = bareSku(lineSku);
    if (bare && bare === bareSku(entry.sku)) return 96;
  }
  const description = normaliseText(line.description);
  if (description && description === normaliseText(entry.name)) return 92;

  const text = `${line.sku ?? ""} ${line.description}`;
  const lineTokens = new Set(tokenise(text));
  const productTokens = new Set(entryTokens(entry));
  if (lineTokens.size === 0 || productTokens.size === 0) return 0;

  // Weighted Jaccard, not weighted recall: a distinctive word the line has
  // and the product lacks is evidence against, exactly as a missing one is.
  let intersection = 0;
  let union = 0;
  for (const token of new Set([...lineTokens, ...productTokens])) {
    const weight = idf(token);
    union += weight;
    if (lineTokens.has(token) && productTokens.has(token)) intersection += weight;
  }
  let score = union === 0 ? 0 : (intersection / union) * OVERLAP_CEILING;

  // Additive rather than gating: a document that omits the brand is common
  // and must not be penalised for it.
  const haystack = ` ${normaliseText(text)} `;
  if (entry.brand && haystack.includes(` ${normaliseText(entry.brand)} `)) {
    score += BRAND_AGREES;
  }
  if (entry.variant && haystack.includes(` ${normaliseText(entry.variant)} `)) {
    score += VARIANT_AGREES;
  }

  // A size disagreement is the strongest evidence in the document that two
  // lines are different products, and it must outrank any amount of wording
  // overlap: 2.1L and 500ML share every word they have.
  const printed = lineSize(line);
  const stocked = entrySize(entry);
  if (printed !== null && stocked !== null) {
    if (printed === stocked) score += SIZE_AGREES;
    else score = Math.min(score, SIZE_MISMATCH_CEILING);
  }

  return Math.max(0, Math.min(SIMILARITY_CEILING, Math.round(score)));
}

/** The top candidates for one line, best first. Nothing auto-selects. */
export function matchLine(
  line: MatchableLine,
  catalogue: CatalogueEntry[],
  idf: Idf,
): Candidate[] {
  if (!line.description.trim() && !line.sku?.trim()) return [];
  return catalogue
    .map((entry) => ({
      productId: entry.id,
      score: scoreLine(line, entry, idf),
      // Ties break on the code so the order is stable and testable.
      sku: normaliseSku(entry.sku),
    }))
    .filter((candidate) => candidate.score >= SUGGEST_MIN)
    .sort((a, b) => b.score - a.score || a.sku.localeCompare(b.sku))
    .slice(0, MAX_CANDIDATES)
    .map(({ productId, score }) => ({ productId, score }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/extraction/match-products.test.ts`
Expected: PASS.

If the smushed-code or generic-description test fails, **do not loosen the assertion** — those two encode the rules the phase exists for. Check `tokenise` first: the letter/digit split and the period-as-separator are the two things most likely wrong.

- [ ] **Step 5: Commit**

```bash
git add src/lib/extraction/match-products.ts src/lib/extraction/match-products.test.ts
git commit -m "feat: score a purchase order line against the catalogue

Pure, no I/O, so it is tested against the codes production actually
holds. An exact code, a code differing only in separators and an exact
name are conclusive; everything else is token overlap weighted by
inverse document frequency, because four of six words in a typical line
are shared by two hundred products.

A size disagreement caps the score at 40 however much wording agrees:
2.1L and 500ML share every word they have and are different products.

Market is never scored. Documents rarely print it, so it would be noise
in the score — but the catalogue holds one product per variant x market,
so it is often the only thing telling two candidates apart, and the
review screen shows it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Extraction suggests and stops writing

**Files:**
- Modify: `src/lib/extraction/resolve-products.ts` (rewrite as two exports)
- Modify: `src/lib/extraction/run.ts:126-146`
- Modify: `src/lib/extraction/resolve-products.test.ts`

**Interfaces:**
- Consumes: nothing from Task 2 — this task needs only exact-code lookup.
- Produces:
  - `suggestProducts(lines: ResolvableLine[]): Promise<(string | null)[]>` — reads only, one query, returns the product id for lines whose printed code matches exactly, `null` otherwise.
  - `createProductsForLines(tx, lines: ResolvableLine[]): Promise<(string | null)[]>` — the current create block, moved, for `"new"` lines only. `tx` is `Prisma.TransactionClient`.
  - `resolveProducts` is **deleted**. Nothing may import it after this task.

Why the split: `resolve-products.ts` is doing two jobs — deciding what a line points at, and creating products — at a moment when nobody has confirmed anything. The ranking half deliberately does **not** move here: candidates are a view of the catalogue, not draft data, so the review screen computes them fresh (Task 6) and they cannot go stale in `draftJson`.

This reverses a Phase 11 decision on purpose. Phase 11 recorded the cost — *"a discarded draft leaves its products behind… moving creation into `confirmPurchaseOrder`'s transaction is the fix if it proves noisy"* — and accepted it because nobody should hand-pick twenty products. An explicit per-line decision now exists, so extraction-time creation buys nothing.

- [ ] **Step 1: Write the failing tests**

Rewrite `src/lib/extraction/resolve-products.test.ts`, keeping its existing Prisma mock setup at the top of the file (read it first — it mocks `@/lib/prisma` before the dynamic import, and that pattern must survive):

```ts
describe("suggestProducts", () => {
  it("returns the product for an exact code", async () => {
    expect(await suggestProducts([line()])).toEqual(["p1"]);
  });

  it("matches case-insensitively", async () => {
    expect(await suggestProducts([line({ sku: "scr-bam-180" })])).toEqual(["p1"]);
  });

  it("returns null for a code the catalogue has never seen", async () => {
    expect(await suggestProducts([line({ sku: "NOT-A-CODE" })])).toEqual([null]);
  });

  it("returns null for a line with no code", async () => {
    expect(await suggestProducts([line({ sku: null })])).toEqual([null]);
  });

  it("creates nothing — a discarded draft must leave no products behind", async () => {
    await suggestProducts([line({ sku: "NOT-A-CODE" })]);
    expect(created).toHaveLength(0);
  });
});
```

`created` is an array the Prisma mock pushes to from `product.createManyAndReturn`. If the existing mock does not expose one, add it — the last test is the whole point of this task.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/extraction/resolve-products.test.ts`
Expected: FAIL — `suggestProducts` is not exported.

- [ ] **Step 3: Rewrite the module**

Replace the body of `src/lib/extraction/resolve-products.ts`. Keep the `ResolvableLine` type and the file's existing doc comment about exact-only matching, updating it to say what changed:

```ts
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normaliseSku } from "@/lib/validation/products";

export type ResolvableLine = {
  description: string;
  sku: string | null;
  unit: string | null;
  unitPrice: string;
};

const key = (value: string) => normaliseSku(value);

/**
 * What a printed code conclusively points at, and nothing more.
 *
 * Matching is exact and case-insensitive, never fuzzy — that rule is from the
 * 2026-09-06 matching work and still holds: silently attaching a line to the
 * wrong product misprices an order and the reviewer cannot see it happened.
 *
 * Since Phase 12 this **writes nothing**. A code the catalogue has never seen
 * returns null and the reviewer decides on the review screen, where ranked
 * suggestions are computed against the live catalogue. Creating products here
 * meant a draft that was never confirmed still grew the catalogue.
 *
 * One query for the whole document, never one per line.
 */
export async function suggestProducts(
  lines: ResolvableLine[],
): Promise<(string | null)[]> {
  const codes = lines
    .map((line) => (line.sku ? normaliseSku(line.sku) : ""))
    .filter((sku): sku is string => Boolean(sku));
  if (codes.length === 0) return lines.map(() => null);

  // An archived product is not something a new order should be filed against.
  const existing = await prisma.product.findMany({
    where: { active: true, sku: { in: codes, mode: "insensitive" } },
    select: { id: true, sku: true },
  });
  const byCode = new Map(existing.map((product) => [key(product.sku), product.id]));

  return lines.map((line) => {
    const code = line.sku ? normaliseSku(line.sku) : "";
    return code ? (byCode.get(code) ?? null) : null;
  });
}

/**
 * Products for the lines the reviewer marked "create a new one", written
 * inside `confirmPurchaseOrder`'s transaction so a discarded draft creates
 * nothing. Returns ids positionally, null where a line carried no code.
 *
 * Cost is bounded: at most one write and at most one re-read for the whole
 * document, never one query per line.
 */
export async function createProductsForLines(
  tx: Prisma.TransactionClient,
  lines: ResolvableLine[],
): Promise<(string | null)[]> {
  const byCode = new Map<string, string>();

  // De-duplicated before any write, so two lines sharing a new code create
  // one product rather than racing each other.
  const missing = new Map<string, ResolvableLine>();
  for (const line of lines) {
    const code = line.sku ? normaliseSku(line.sku) : "";
    if (!code || missing.has(code)) continue;
    missing.set(code, line);
  }
  if (missing.size === 0) return lines.map(() => null);

  const created = await tx.product.createManyAndReturn({
    // Another confirm may be creating the same code right now; `sku` is
    // unique, so a duplicate is skipped here and re-read below rather than
    // failing the whole confirm.
    skipDuplicates: true,
    data: [...missing.values()].map((line) => ({
      sku: normaliseSku(line.sku!),
      name: line.description.trim(),
      // Product.unit is required and a document does not always print one.
      unit: line.unit?.trim() || "unit",
      listPrice: line.unitPrice,
      // A real member of PRODUCT_CATEGORIES, never free text.
      category: "Uncategorised",
      active: true,
      needsReview: true,
    })),
    select: { id: true, sku: true },
  });
  for (const product of created) byCode.set(key(product.sku), product.id);

  const stillMissing = [...missing.keys()].filter((code) => !byCode.has(code));
  if (stillMissing.length > 0) {
    const raced = await tx.product.findMany({
      where: { sku: { in: stillMissing, mode: "insensitive" } },
      select: { id: true, sku: true },
    });
    for (const product of raced) byCode.set(key(product.sku), product.id);
  }

  return lines.map((line) => {
    const code = line.sku ? normaliseSku(line.sku) : "";
    return code ? (byCode.get(code) ?? null) : null;
  });
}
```

- [ ] **Step 4: Rewire the runner**

In `src/lib/extraction/run.ts`, change the import to `suggestProducts` and rename the call:

```ts
  // Only what the printed code conclusively points at. Ranked suggestions are
  // the review screen's job, computed live against the catalogue, so they
  // cannot go stale inside a draft that sits in the queue for days.
  const products = await suggestProducts(
```

In the returned `lineItems`, add the decision beside `productId`:

```ts
      productId: products[index],
      // A suggestion, never a decision: an exact code opens the picker on the
      // right row, and a person still has to say so.
      productDecision: "unset" as const,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/extraction/` then `npm test`
Expected: PASS. `src/actions/confirm.test.ts` and `src/actions/purchase-orders.test.ts` mock `resolveProducts` by name — they will fail. Leave them failing; Task 4 owns those files and fixes the mocks there. Note which tests fail so Task 4 can confirm it fixed exactly those.

- [ ] **Step 6: Commit**

```bash
git add src/lib/extraction/resolve-products.ts src/lib/extraction/resolve-products.test.ts src/lib/extraction/run.ts
git commit -m "refactor: extraction suggests a product instead of creating one

resolveProducts was deciding what a line points at and creating products
in the same breath, at a moment when nobody had confirmed anything, so a
draft that was never confirmed still grew the catalogue. It splits:
suggestProducts reads, createProductsForLines writes inside the confirm
transaction.

This reverses a Phase 11 decision deliberately. Phase 11 accepted the
junk because nobody should hand-pick twenty products; an explicit
per-line decision now exists, so extraction-time creation buys nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Confirm honours the decision

**Files:**
- Modify: `src/actions/purchase-orders.ts:213-295`
- Modify: `src/actions/confirm.test.ts`
- Modify: `src/actions/purchase-orders.test.ts:53` (the mock)

**Interfaces:**
- Consumes: `productDecision` (Task 1), `createProductsForLines` (Task 3).
- Produces: `confirmPurchaseOrder` refusing a draft with an `unset` line, and writing `LineItem.productId` from the decision.

The `resolveProducts` call at line 218 is what currently overwrites a human choice with whatever the typed code resolves to. It goes.

- [ ] **Step 1: Write the failing tests**

In `src/actions/confirm.test.ts`, first fix the mock — `resolveProducts` no longer exists:

```ts
vi.mock("@/lib/extraction/resolve-products", () => ({
  suggestProducts: (lines: unknown[]) => Promise.resolve(lines.map(() => null)),
  createProductsForLines: (_tx: unknown, lines: unknown[]) =>
    Promise.resolve(lines.map((_, i) => `new-${i}`)),
}));
```

Apply the same change to `src/actions/purchase-orders.test.ts:53`.

Then add:

```ts
describe("confirmPurchaseOrder — the product gate", () => {
  it("refuses a draft with an undecided line", async () => {
    const result = await confirmPurchaseOrder(
      "ext-1",
      draft({ lineItems: [line({ productDecision: "unset" })] }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/every line needs a product/i);
  });

  it("writes the chosen product, not the one the printed code resolves to", async () => {
    // The whole point: a reviewer corrected the match by hand, and confirm
    // used to overwrite it by re-deriving productId from the code.
    await confirmPurchaseOrder(
      "ext-1",
      draft({
        lineItems: [
          line({ sku: "ZEN-SC-2100-GM-VN", productDecision: "linked", productId: "chosen" }),
        ],
      }),
    );
    expect(writtenLineItems[0].productId).toBe("chosen");
  });

  it("writes no product for a line that is not a product", async () => {
    await confirmPurchaseOrder(
      "ext-1",
      draft({ lineItems: [line({ description: "Delivery", productDecision: "none" })] }),
    );
    expect(writtenLineItems[0].productId).toBeNull();
  });

  it("creates a product only for the lines marked new", async () => {
    await confirmPurchaseOrder(
      "ext-1",
      draft({
        lineItems: [
          line({ productDecision: "linked", productId: "chosen" }),
          line({ sku: "BRAND-NEW-1", productDecision: "new" }),
        ],
      }),
    );
    expect(createdForLines).toHaveLength(1);
    expect(createdForLines[0].sku).toBe("BRAND-NEW-1");
  });

  it("refuses a linked line whose product has since been archived, naming the line", async () => {
    archivedProductIds.add("gone");
    const result = await confirmPurchaseOrder(
      "ext-1",
      draft({ lineItems: [line({ productDecision: "linked", productId: "gone" })] }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/line 1/i);
  });
});
```

`writtenLineItems`, `createdForLines` and `archivedProductIds` are captured by the existing Prisma mock in that file — read it and extend it rather than adding a second mock. `line()` and `draft()` are its existing factories; add `productDecision: "linked"` to the `line()` default so the file's other tests keep passing.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/actions/confirm.test.ts`
Expected: FAIL — the gate does not exist and `productId` still comes from the code.

- [ ] **Step 3: Add the gate**

In `src/actions/purchase-orders.ts`, immediately after the totals gate, replace the `resolveProducts` call and its comment with:

```ts
  // Since Phase 12 the reviewer's decision is authoritative. Re-deriving
  // productId from the printed code here is what used to overwrite a
  // correction someone had made by hand.
  const undecided = data.lineItems.findIndex(
    (line) => line.productDecision === "unset",
  );
  if (undecided >= 0) {
    return {
      success: false,
      error: `Every line needs a product — line ${undecided + 1} is undecided.`,
    };
  }
```

- [ ] **Step 4: Resolve the decisions inside the transaction**

Inside `prisma.$transaction`, before `tx.lineItem.createMany`:

```ts
      // A draft can sit in the queue for days; the product it points at may
      // have been archived or deleted since it was chosen.
      const linkedIds = [
        ...new Set(
          data.lineItems
            .filter((line) => line.productDecision === "linked")
            .map((line) => line.productId!),
        ),
      ];
      const live = new Set(
        (
          await tx.product.findMany({
            where: { id: { in: linkedIds }, active: true },
            select: { id: true },
          })
        ).map((product) => product.id),
      );
      const stale = data.lineItems.findIndex(
        (line) => line.productDecision === "linked" && !live.has(line.productId!),
      );
      if (stale >= 0) throw new Error(`STALE_PRODUCT:${stale + 1}`);

      // Only the lines asking to be created reach the write, and positions
      // are kept so ids map back to the right rows.
      const newLines = data.lineItems.filter(
        (line) => line.productDecision === "new",
      );
      const createdIds = await createProductsForLines(
        tx,
        newLines.map((line) => ({
          description: line.description,
          sku: line.sku,
          unit: line.unit,
          unitPrice: line.unitPrice,
        })),
      );
      const created = new Map(
        newLines.map((line, index) => [line, createdIds[index] ?? null]),
      );
```

Then change the `productId` expression in `tx.lineItem.createMany`:

```ts
          productId:
            line.productDecision === "linked"
              ? line.productId!
              : line.productDecision === "new"
                ? (created.get(line) ?? null)
                : null,
```

- [ ] **Step 5: Report the stale-product failure**

Find the `catch` around the transaction that already translates `MISSING_REVISED`, `MISSING_EXTRACTION` and `ALREADY_CONFIRMED` into messages, and add a branch in the same style:

```ts
      if (message.startsWith("STALE_PRODUCT:")) {
        return {
          success: false,
          error: `The product chosen for line ${message.split(":")[1]} is no longer in the catalogue. Choose another.`,
        };
      }
```

Match the surrounding code's exact idiom for reading the error message — copy how `MISSING_REVISED` is detected rather than inventing a second way.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, including the tests Task 3 left failing. If any remain, they are mocks still naming `resolveProducts`.

- [ ] **Step 7: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/actions/purchase-orders.ts src/actions/confirm.test.ts src/actions/purchase-orders.test.ts
git commit -m "feat: confirm honours the reviewer's product decision

confirmPurchaseOrder re-ran resolveProducts and overwrote productId from
the printed code, so a correction made by hand had nowhere to survive.
The decision on each line is now authoritative, new products are created
inside the existing transaction, and a draft with an undecided line is
refused by the server, not only by the button.

A linked product archived while the draft sat in the queue fails by line
number rather than writing a dangling link.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `Combobox` gains pinned rows

**Files:**
- Modify: `src/components/review/Combobox.tsx:24-45`

**Interfaces:**
- Consumes: nothing.
- Produces: an optional `pinned?: ComboboxOption[]` prop, rendered at the foot of the list and never filtered by the query.

Why: `Combobox` filters by `label.toLowerCase().includes(needle)`. The two decision rows — *Create new product from this line* and *Not a product* — must stay reachable when the reviewer has typed a search that matches nothing, which is exactly when "create new" is the answer. The buyer picker passes no `pinned` and is unchanged.

- [ ] **Step 1: Add the prop**

Add `pinned` to the props type and destructuring:

```ts
  /**
   * Rows always shown at the foot of the list, whatever the query. A decision
   * like "create a new one" has to stay reachable precisely when the search
   * matches nothing, which is when the filtered list would have dropped it.
   */
  pinned?: ComboboxOption[];
```

Include pinned options in the `selected` lookup so the trigger can render one:

```ts
  const all = [...options, ...(pinned ?? [])];
  const selected = all.find((option) => option.id === value);
```

Leave `matches` and `exact` computed from `options` alone — a pinned row must not suppress the "Create …" row, and must not be filtered.

- [ ] **Step 2: Render them**

After the mapped `matches` in the list, and after the create row, render the pinned rows with the same option markup as `matches`, separated by `border-t border-hairline`. Copy the existing option element exactly — same classes, same `onSelect`, same check mark — rather than writing a second variant.

- [ ] **Step 3: Verify nothing else changed**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS. No test covers `Combobox` (there are no component tests); this step is guarding the type change and the buyer picker's untouched call sites.

- [ ] **Step 4: Commit**

```bash
git add src/components/review/Combobox.tsx
git commit -m "feat: Combobox can pin rows below the filtered list

A decision row has to stay reachable when the query matches nothing,
which is exactly when it is the answer. Filtering still applies to the
ordinary options, and the buyer picker passes no pinned rows.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The picker in the line-items table

**Files:**
- Create: `src/components/review/ProductMatchPicker.tsx`
- Modify: `src/components/review/LineItemsTable.tsx`
- Modify: `src/app/globals.css:174` (`--spacing-line-items`)
- Modify: `src/app/(portal)/review/[id]/page.tsx` (the product query and prop)

**Interfaces:**
- Consumes: `CatalogueEntry`, `Idf`, `matchLine`, `STRONG_MATCH` (Task 2); the `decision` action (Task 1); `pinned` (Task 5). `buildIdf` is **not** called here — Task 7 builds the weights once for the document and passes them down.
- Produces: `ProductMatchPicker` with props `{ line: DraftLineItem; index: number; catalogue: CatalogueEntry[]; idf: Idf; dispatch: Dispatch<DraftAction> }`. `LineItemsTable`'s `products: ProductOption[]` prop is **replaced** by `catalogue: CatalogueEntry[]` and `idf: Idf`; the `ProductOption` type is deleted.

`ProductOption` is used in exactly two places — its declaration and one `products.find(...)` label lookup — so replacing it is contained.

- [ ] **Step 1: Widen the table token**

In `src/app/globals.css`, change `--spacing-line-items: 840px;` to `952px` and update the comment beside it if there is one. The first column grows from `w-44` (176px) to `w-72` (288px); under `table-fixed` the `<col>` widths are authoritative and this token is what the scroller measures, so the two must move together or the columns and the container disagree.

- [ ] **Step 2: Ship the catalogue to the review screen**

In `src/app/(portal)/review/[id]/page.tsx`, extend the product query and the prop:

```ts
    prisma.product.findMany({
      where: { active: true },
      select: {
        id: true,
        sku: true,
        name: true,
        brand: true,
        variant: true,
        market: true,
        packSize: true,
        unit: true,
      },
      orderBy: { name: "asc" },
    }),
```

Pass it straight through as `catalogue={products}` — the select already matches `CatalogueEntry` field for field, so no mapping is needed. Delete the `products.map(...)` block that built `ProductOption`s.

Ranked candidates are **not** computed here and **not** stored in `draftJson`: they are a view of the catalogue, and a draft can sit in the queue for days while the catalogue moves. The client ranks them fresh, which is also what makes an edited code re-rank live.

- [ ] **Step 3: Write the picker**

Create `src/components/review/ProductMatchPicker.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import type { Dispatch } from "react";
import { Combobox } from "@/components/review/Combobox";
import type { DraftAction } from "@/components/review/draft-reducer";
import {
  matchLine,
  STRONG_MATCH,
  type CatalogueEntry,
  type Idf,
} from "@/lib/extraction/match-products";
import type { DraftLineItem } from "@/lib/validation/purchase-orders";

const NEW = "__new__";
const NONE = "__none__";

/** "ZEN-SC-2100-GM-VN · Goat's Milk · Vietnam · 6/carton" */
function describe(entry: CatalogueEntry): string {
  return [
    entry.sku,
    entry.name,
    entry.variant,
    // Market is the thing that separates two otherwise identical rows: the
    // catalogue holds one product per variant x market, and a document almost
    // never prints which. It is shown for exactly that reason, and never
    // scored — scoring it would be noise on every line.
    entry.market,
    entry.packSize ? `${entry.packSize}/${entry.unit}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ProductMatchPicker({
  line,
  index,
  catalogue,
  idf,
  dispatch,
}: {
  line: DraftLineItem;
  index: number;
  catalogue: CatalogueEntry[];
  idf: Idf;
  dispatch: Dispatch<DraftAction>;
}) {
  // Re-ranks as the reviewer corrects the printed code or the description.
  const candidates = useMemo(
    () => matchLine({ description: line.description, sku: line.sku }, catalogue, idf),
    [line.description, line.sku, catalogue, idf],
  );

  const byId = useMemo(
    () => new Map(catalogue.map((entry) => [entry.id, entry])),
    [catalogue],
  );

  // Candidates first so `Combobox`'s unfiltered slice(0, 50) shows the ranked
  // ones rather than fifty alphabetical products. The label carries the code,
  // the name and the market on purpose: it is what the query filters on, so
  // typing "vietnam" or a code both work.
  const options = useMemo(() => {
    const ranked = candidates
      .map((candidate) => byId.get(candidate.productId))
      .filter((entry): entry is CatalogueEntry => Boolean(entry));
    const rankedIds = new Set(ranked.map((entry) => entry.id));
    const rest = catalogue.filter((entry) => !rankedIds.has(entry.id));
    return [...ranked, ...rest].map((entry) => ({
      id: entry.id,
      label: describe(entry),
    }));
  }, [candidates, byId, catalogue]);

  const top = candidates[0];
  const selected =
    line.productDecision === "linked"
      ? line.productId
      : line.productDecision === "new"
        ? NEW
        : line.productDecision === "none"
          ? NONE
          : null;

  return (
    <div className="flex flex-col gap-xxs">
      <Combobox
        ariaLabel={`Product, line ${index + 1}`}
        value={selected}
        placeholder="Choose a product"
        options={options}
        pinned={[
          { id: NEW, label: "Create new product from this line" },
          { id: NONE, label: "Not a product" },
        ]}
        onSelect={(option) =>
          dispatch({
            type: "decision",
            index,
            decision:
              option.id === NEW ? "new" : option.id === NONE ? "none" : "linked",
            productId:
              option.id === NEW || option.id === NONE ? null : option.id,
          })
        }
      />
      {line.productDecision === "unset" ? (
        <MatchHint score={top?.score ?? null} />
      ) : null}
    </div>
  );
}

/**
 * The machine's opinion, shown only while nobody has decided. Once a person
 * has, the score is history and the row says so instead.
 */
function MatchHint({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="text-[length:var(--text-caption)] text-ink-tertiary">
        No match — choose or create
      </span>
    );
  }
  const strong = score >= STRONG_MATCH;
  return (
    <span
      className={`text-[length:var(--text-caption)] ${
        strong ? "text-accent-green" : "text-accent-amber"
      }`}
    >
      {`Suggested · ${score}% match`}
    </span>
  );
}
```

**Before using `text-accent-green` and `text-accent-amber`, confirm those exact token names exist** in `src/app/globals.css`. The status palette is defined in `00-master.md` §4 and the amber must be the same amber `LOW_CONFIDENCE` already uses elsewhere on this screen — grep the review components for the existing low-confidence class and reuse it verbatim. If the names differ, use the real ones; do not add new colour tokens.

- [ ] **Step 4: Put it in the table**

In `src/components/review/LineItemsTable.tsx`:

- Delete `export type ProductOption = ComboboxOption & { unit: string | null }` and its `ComboboxOption` import if now unused.
- Change the props to `catalogue: CatalogueEntry[]` and `idf: Idf`.
- Change the first `<col className="w-44" />` to `w-72`.
- Change the first header from `"Product Code"` to `"Product"`.
- In the first cell, keep the existing code `Input` exactly as it is — it still writes `LineItem.sku`, which is what the document printed and what the PO detail screen shows — and **replace the `<span>` beneath it** (the `products.find(...)` label) with `<ProductMatchPicker line={line} index={index} catalogue={catalogue} idf={idf} dispatch={dispatch} />`.

Update the `<colgroup>` comment: the widths now sum to `--spacing-line-items` (952px).

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS, except in `ReviewForm.tsx`, which still passes `products`. Task 7 owns it — if the error is only there, continue.

- [ ] **Step 6: Commit**

```bash
git add src/components/review/ProductMatchPicker.tsx src/components/review/LineItemsTable.tsx src/app/globals.css "src/app/(portal)/review/[id]/page.tsx"
git commit -m "feat: choose the product for a line, with its market and a match score

Candidates are ranked on the client against the live catalogue rather
than stored in the draft, so a code corrected by the reviewer re-ranks
live and a draft that sits in the queue for days cannot show stale
suggestions.

Every candidate shows its market. The catalogue holds one product per
variant x market and a document almost never prints which, so it is
frequently the only thing telling two candidates apart.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: The gate, and accepting the exact matches

**Files:**
- Modify: `src/components/review/ReviewForm.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1, 2 and 6.
- Produces: `blockedByProducts`, an `idf` memo, and the *Accept all exact matches* control. No new exports.

- [ ] **Step 1: Swap the prop and build the idf once**

Replace the `products: ProductOption[]` prop with `catalogue: CatalogueEntry[]`, updating the import. Add:

```ts
import { buildIdf, matchLine, type CatalogueEntry } from "@/lib/extraction/match-products";
```

`ProductOption` no longer exists — Task 6 deleted it — so remove it from the
`LineItemsTable` import list. Build the weights once for the whole document, not once per line:

```ts
  // Once per document. Every line's ranking reads these weights.
  const idf = useMemo(() => buildIdf(catalogue), [catalogue]);
```

Pass `catalogue={catalogue} idf={idf}` to `LineItemsTable` in place of `products`.

- [ ] **Step 2: Add the gate**

Beside `blockedByTotals` and `blockedByDuplicate`, following their exact idiom:

```ts
  const undecided = draft.lineItems.filter(
    (line) => line.productDecision === "unset",
  ).length;
  const blockedByProducts = undecided > 0;
```

Add `!blockedByProducts &&` to `canConfirm`, and a lock message beside the button in the same shape as the totals one:

```tsx
              {blockedByProducts ? (
                <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                  {`Locked — ${undecided} ${undecided === 1 ? "line needs" : "lines need"} a product`}
                </p>
              ) : null}
```

- [ ] **Step 3: Add "Accept all exact matches"**

Above `LineItemsTable`, a button enabled only when an undecided line has a candidate scoring 100:

```tsx
  const exactMatches = useMemo(
    () =>
      draft.lineItems
        .map((line, index) => {
          if (line.productDecision !== "unset") return null;
          const [top] = matchLine(
            { description: line.description, sku: line.sku },
            catalogue,
            idf,
          );
          return top?.score === 100 ? { index, productId: top.productId } : null;
        })
        .filter((match): match is { index: number; productId: string } => match !== null),
    [draft.lineItems, catalogue, idf],
  );
```

```tsx
        {exactMatches.length > 0 ? (
          <Button
            variant="secondary"
            onClick={() => {
              // The gate stays literal — every line needs a decision — while a
              // twenty-line order whose codes all match is one click.
              for (const match of exactMatches) {
                dispatch({
                  type: "decision",
                  index: match.index,
                  decision: "linked",
                  productId: match.productId,
                });
              }
            }}
          >
            {`Accept ${exactMatches.length} exact ${exactMatches.length === 1 ? "match" : "matches"}`}
          </Button>
        ) : null}
```

Use the secondary button variant this codebase already has — check `src/components/ui/button.tsx` for the real variant name. **Never a purple fill**: the primary CTA is the dark `bg-ink` pill, and `#7612fa` only ever appears inside `bg-brand-gradient`.

- [ ] **Step 4: Verify the draft still saves**

`saveDraft` is debounced at 800 ms and posts the whole draft. `productDecision` rides along because it is part of `PoDraft`. Confirm no separate serialisation strips it — grep `ReviewForm.tsx` for where the draft is sent and check it sends `draft` whole rather than a field list.

- [ ] **Step 5: Typecheck, lint, test, build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all PASS. **Do not commit until the build passes.**

- [ ] **Step 6: Commit**

```bash
git add src/components/review/ReviewForm.tsx
git commit -m "feat: Confirm locks until every line has a product

Phrased like the totals gate it sits beside, and mirrored by the server
check so calling the action directly cannot bypass it. Accept all exact
matches keeps the gate literal while making a twenty-line order whose
codes all match one click rather than twenty.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Verify in the browser

**Files:** none — this task changes nothing unless it finds something.

There are no component tests in this repo and this plan does not add a harness. The UI is verified the way this project has always verified it: in a real browser against the development database (`ep-mute-frog`, the **last** `DATABASE_URL` block in `.env.local` — the `ep-red-hat` pair above it is dead and both Next and `--env-file` take the last duplicate key).

- [ ] **Step 1: Start the dev server and open a draft**

Run `npm run dev`. Two drafts are waiting in the review queue. Open one at `/review/[id]`.

- [ ] **Step 2: Walk the acceptance criteria**

Check each against `docs/specs/12-product-matching.md` §7:

1. A PO printing our exact codes suggests every line at 100 and confirms in two clicks — *Accept all exact matches*, then Confirm.
2. A PO printing only descriptions offers ranked suggestions, with the right product in the top five for a line naming brand, size and variant.
3. Confirm is disabled while any line reads *Choose a product*, with the lock message beside it.
4. A product chosen by hand survives Confirm — check the saved `LineItem.productId` in the database, on a line whose printed code resolves elsewhere.
5. Two products differing only by market are told apart in the picker without opening another screen.
6. A discarded draft creates no products — count `Product` rows before and after.
7. *Not a product* confirms with `productId: null` and no product created.
8. No horizontal page overflow at 390px, 768px and 1440px.

Criterion 8 is not optional and is where this table has failed before: Phase 11 found the line-items table pushing the *page* sideways at 390px because the flex column and the section above it both defaulted to `min-width: auto`. `min-w-0` on both is what holds it. Measure `document.documentElement.scrollWidth` against `clientWidth` at each width rather than judging by eye.

- [ ] **Step 3: Remove every trace of the test run**

This project's practice is that verification leaves nothing behind. Delete any purchase order, line items, stage events, products and documents the walkthrough created, and any R2 objects. Record the counts before and after so the report can state it.

- [ ] **Step 4: Report, then finish the branch**

Write what was measured — not "it works". Name the numbers: how many lines suggested at 100, what the top score was for a description-only line, the overflow measurements at each width, and the row counts removed.

Then use the `superpowers:finishing-a-development-branch` skill. **Do not merge without asking** — `context/ai-interaction.md` requires permission to commit and to merge, and the branch is deleted only after the user says so.

- [ ] **Step 5: Update `context/current-feature.md`**

Move the Phase 12 entry from *Status* into *History* with today's date, written the way the existing entries are: what was built, what the browser found that the build could not, what was measured, what was removed, and anything known-but-unfixed. Note explicitly that Phase 13 — the super-admin vocabulary screen — is the next spec.

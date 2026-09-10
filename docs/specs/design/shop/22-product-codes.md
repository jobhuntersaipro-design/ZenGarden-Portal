# Phase 22 — Product codes: the buyer's own aliases

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every code and description a customer has printed on a confirmed purchase order is remembered against the product a person matched it to; extraction reads that memory before it guesses; the review screen offers it first; a super admin decides the ones nobody has; and the generated purchase order prints the buyer's own code above ours.

**Architecture:** A `ProductAlias` table keyed by buyer, printed code and printed description. It is written at confirm — inside `writePurchaseOrder`, the one writer — from the decisions the reviewer already makes, so learning costs nobody a click. `toDraft` consults it before `suggestProducts`; the review page passes the hits to `ProductMatchPicker`; an admin screen lists, filters and decides. Phases 19 and 20 read one lookup for the code column.

**Tech Stack:** As 17, plus `src/lib/extraction/match-products.ts` (ranking for the inline picker), the admin shell.

**Spec:** this file, `00-overview.md`, artboard `ProductAliases`, and the *Product code* column of `PurchaseOrderDoc`. Read `docs/specs/12-product-matching.md` and `src/lib/extraction/resolve-products.ts` first — this phase adds a memory in front of that matching and changes none of its rules.

**Branch:** `feature/product-codes`. Depends on 19 (the PDF's code column) and 12; independent of 20 and 21.

## Global constraints

- Phase 17's for anything on the shop; the admin screen follows the portal's design conventions (`00-master.md` §4).
- Matching by alias is **exact** — normalised code, or normalised description — never fuzzy. Fuzzy ranking stays where Phase 12 put it, in the picker, for a person to choose from.
- A buyer's alias beats everyone else's; an alias from another buyer is used only when it is the *only* answer.
- Learning writes inside the confirm transaction and never fails a confirm: an alias upsert that throws is caught and logged.
- `requireSuperAdmin()` on every alias action.

---

## 0. Why this exists

Customers name products their own way — `ZEN/SC/2100/CARROT`, `ZENHW-LAV500ML`, `KE218441 68216` — and the 2026-09-09 audit found that only the customer's code can ever match an incoming document, because that is what it prints. Phase 12 made the match a human decision; every decision is then forgotten, and the next PO from the same buyer asks the same question. The canvas draws the memory: a code, the buyer who printed it, and what a person said it was. Two features meet in it — the next emailed PO matches on its own, and the purchase order the shop generates prints the code the buyer's accounts department already uses.

## 1. Data model

```prisma
model ProductAlias {
  id           String             @id @default(cuid())
  /// Null means "any buyer": an admin's decision, never a learned row. A learned alias always names the buyer whose document printed it.
  buyerId      String?
  buyer        Buyer?             @relation(fields: [buyerId], references: [id])
  /// normaliseSku(printed code); null when the line printed none.
  code         String?
  /// The printed description, trimmed and whitespace-collapsed, as printed.
  description  String
  /// `${buyerId ?? "*"}\0${code ?? ""}\0${description.toUpperCase()}` — one row per triple, NULLs included.
  lookupKey    String             @unique
  /// Null with status LEARNED/CONFIRMED means "not a product" (packaging, a delivery charge).
  productId    String?
  product      Product?           @relation(fields: [productId], references: [id], onDelete: SetNull)
  status       ProductAliasStatus @default(UNDECIDED)
  seenCount    Int                @default(1)
  lastSeenAt   DateTime           @default(now())
  decidedById  String?
  decidedBy    User?              @relation("aliasDecisions", fields: [decidedById], references: [id])
  decidedAt    DateTime?
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  @@index([buyerId, code])
  @@index([code])
  @@index([status, seenCount])
}

/// UNDECIDED: seen on a draft, never confirmed. LEARNED: written from a reviewer's decision at confirm. CONFIRMED: decided on the admin screen.
enum ProductAliasStatus { UNDECIDED  LEARNED  CONFIRMED }

model LineItem {
  // …
  /// How productId was arrived at: alias | sku | manual | new | none | shop. For the admin KPI.
  matchedBy String?
}
```

`Buyer.aliases`, `Product.aliases`, `User.aliasDecisions` back-relations. Migration `20260914100000_product_aliases`: the enum, the table, the indexes, the FKs, `ALTER TABLE "LineItem" ADD COLUMN "matchedBy" TEXT`.

`lookupKey` exists because Postgres treats two NULLs as distinct in a unique index: without it a null buyer or null code could be inserted twice. The separator is the NUL character (`"\0"` in TypeScript), which no printed code or description can contain.

```ts
// src/lib/aliases.ts — pure
export const normaliseDescription = (value: string) => value.trim().replace(/\s+/g, " ");
export function aliasLookupKey(buyerId: string | null, code: string | null, description: string): string;
```

## 2. Reading aliases

```ts
// src/lib/queries/product-aliases.ts
export type AliasHit = { productId: string | null; aliasId: string; scope: "buyer" | "any" | "other"; buyerName: string | null; seenCount: number };

/**
 * One query for the whole document. Precedence per line:
 *   1. this buyer's alias on the printed code;
 *   2. this buyer's alias on the printed description (a line with no code);
 *   3. an any-buyer alias on the code;
 *   4. other buyers' aliases on the code — only when they all name one product.
 * LEARNED and CONFIRMED only. A hit whose productId is null is a real answer:
 * "not a product", which the draft records as decision "none".
 */
export async function resolveAliases(buyerId: string | null, lines: { sku: string | null; description: string }[]): Promise<(AliasHit | null)[]>;

/** Upsert UNDECIDED rows for lines nothing resolved, seenCount + 1 on repeat. Never downgrades a decided row. */
export async function recordUndecided(buyerId: string, lines: { sku: string | null; description: string }[]): Promise<void>;

/**
 * Called inside writePurchaseOrder. For each line with a printed code or description:
 * CONFIRMED rows keep their product and gain a count; anything else takes the
 * reviewer's decision (productId, or null for "none") and becomes LEARNED.
 */
export async function learnAliases(tx: Prisma.TransactionClient, buyerId: string, lines: { sku: string | null; description: string; productId: string | null; decision: ProductDecision }[]): Promise<void>;

/** productId → the buyer's own code: CONFIRMED first, then the most-seen LEARNED, code non-null. */
export async function buyerCodesFor(buyerId: string, productIds: string[]): Promise<Map<string, string>>;
```

## 3. Where it plugs in

- **`toDraft`** (`src/lib/extraction/run.ts`): after the buyer match, `hits = resolveAliases(buyerId, lines)`. A hit sets `productId`, `productDecision: hit.productId ? "linked" : "none"`, and `matchedBy: "alias"` on the draft line; lines without a hit go through `suggestProducts` as today (`matchedBy: "sku"` when it answers); lines still unresolved are passed to `recordUndecided` when a buyer is known. `DraftLineItemFields` gains `matchedBy: z.enum(["alias","sku","manual","new","none","shop"]).optional()`.
- **The review page** (`src/app/(portal)/review/[id]/page.tsx`) computes `aliasHits` fresh for the draft's lines and buyer — never from `draftJson`, for the reason the catalogue is not stored there — and passes them to `ReviewForm` → `ProductMatchPicker`, which lists the alias's product first with the hint `"Learned from {buyer}'s orders · {n}×"` (or "Any buyer") at score 100, above the ranked candidates. Changing the buyer on the form clears the hits (they are recomputed on the next render through the URL, as the catalogue is).
- **`writePurchaseOrder`**: after `lineItem.createMany`, `learnAliases(tx, buyerId, …)` for lines with a `sku` or `description`, wrapped in `try/catch` that logs; `matchedBy` per line = the draft's `matchedBy` when the decision is still `linked` to the same product, else `"manual"` for a changed link, `"new"`, `"none"`. `confirmWebOrder`'s lines carry `matchedBy: "shop"` and print no code, so `learnAliases` skips them.
- **Phase 19's `buildPoDocumentData`** and **Phase 20's `listClientHistory`**: `codes = buyerCodesFor(buyerId, productIds)`; a line with an alias prints `code = alias`, `ourRef = sku`; otherwise `code = sku`, `ourRef = null`. The ops PO detail page's line table already prints the printed code; nothing changes there.

## 4. The admin screen — `/admin/product-codes`

`src/app/(admin)/admin/product-codes/page.tsx` (the admin layout already guards). The admin header gains a two-link nav — **Users** · **Product codes** — active by pathname, in the eyebrow style. `h1` **Product codes**, the paragraph from the artboard.

**KPIs** (`aliasKpis()` in `product-aliases.ts`, three `KpiTile`s; the third `border-brand-amber bg-surface` when non-zero):

| Tile | Value | Caption |
|---|---|---|
| Codes learned | aliases with status ≠ UNDECIDED | "from {n} confirmed line items" (count of `LineItem`) |
| Matched automatically last month | lines on POs confirmed in the last 30 days with `matchedBy IN ('alias','sku')` ÷ all such lines, as a percentage | "of lines, up from {previous 30 days}%" ("—" when either window is empty) |
| Waiting for a decision | UNDECIDED aliases | "{k} seen more than once, never matched" |

**Controls**: search (code, description or product name — `ILIKE` on all three), a *Buyer* `Select` (All buyers · Any buyer · each buyer), a `SegmentGroup` All · Confirmed · Learned · Needs a decision (`?status=`). URL is state.

**Table** (`ProductAliasTable`, client; `DataTable` is not used because the *Maps to* cell is an editor): `grid-cols-[168px_168px_1fr_260px_96px_44px]` from `lg`, cards below; columns Buyer (*Any buyer* in `ink-tertiary`) · Printed code (mono; `— no code printed` in `ink-disabled`) · Printed description · Maps to (product name with the SKU in mono beneath; `Not a product — …` italic in `ink-tertiary`; for an UNDECIDED row, an inline `Combobox` whose options are the ranked `matchLine` candidates for `{ description, sku }` over the live catalogue — `catalogue: CatalogueEntry[]` passed from the page as the review page does — each with its score as the hint, plus the pinned **Not a product**) · Status chip (`Confirmed` ✓ in `accent-green`; `Learned · {n}×` in `ink-secondary`; `Seen {n}×` in `brand-amber` — all `rounded-pill border` chips, text on canvas, never a fill) · a kebab `DropdownMenu`: *Change product* (turns the cell into the Combobox), *Mark not a product*, *Apply to any buyer* / *Restrict to {buyer}*, *Delete*. An UNDECIDED row is `bg-surface`. `TablePagination` at 30. The footnote from the artboard closes the page.

```ts
// src/actions/product-aliases.ts   "use server", every one requireSuperAdmin()
export async function decideAlias(id: string, target: { productId: string | null }): Promise<ActionResult>;   // → CONFIRMED, decidedBy, decidedAt
export async function setAliasScope(id: string, anyBuyer: boolean): Promise<ActionResult>;                    // rewrites lookupKey; P2002 → "That code is already decided for any buyer."
export async function deleteAlias(id: string): Promise<ActionResult>;
```

---

## 5. Tasks

### Task 1: Schema, migration, the pure module

**Files:** `prisma/schema.prisma`, `prisma/migrations/20260914100000_product_aliases/migration.sql`, `src/lib/aliases.ts`, `src/lib/aliases.test.ts`, `src/lib/validation/purchase-orders.ts` (`matchedBy`)

- [ ] Failing tests: `aliasLookupKey("b1", "zen/sc/2100/gm", " Zen  Garden ")` → `"b1\0ZEN/SC/2100/GM\0ZEN GARDEN"`; a null buyer → `"*"` prefix; a null code → empty middle; `normaliseDescription` collapses whitespace and keeps case.
- [ ] Migration by hand; deploy; generate; status clean. Implement → PASS. Commit `feat(db): ProductAlias — a buyer's own codes, and how each line was matched`

### Task 2: Reading, recording and learning

**Files:** `src/lib/queries/product-aliases.ts`, `src/lib/queries/product-aliases.test.ts`

- [ ] Failing tests (mock prisma):

```ts
it("prefers the buyer's code alias over an any-buyer one over another buyer's", …)
it("falls back to the description when the line printed no code", …)
it("uses other buyers' aliases only when they agree on one product", …)     // two buyers, two products → null
it("returns a not-a-product hit as productId null, not as a miss", …)
it("recordUndecided upserts with seenCount increment and never touches a LEARNED row", …)
it("learnAliases keeps a CONFIRMED product and overwrites a LEARNED one", …)
it("learnAliases writes null for decision none and skips lines with neither code nor description", …)
it("buyerCodesFor prefers CONFIRMED, then the most-seen, and skips null codes", …)
```

- [ ] FAIL → implement §2 (one `findMany` with an `OR` of lookup keys for steps 1–3, one more for step 4 restricted to the codes still unresolved) → PASS. Commit `feat(aliases): resolve, record and learn a buyer's product codes`

### Task 3: Extraction and confirm

**Files:** `src/lib/extraction/run.ts`, `src/lib/extraction/run.test.ts` (new — `toDraft` has no test today; export it for the purpose), `src/actions/purchase-orders.ts`, `src/actions/confirm.test.ts`, `src/actions/confirm-web-order.test.ts`

- [ ] Failing tests: `toDraft` with an alias hit sets `productId`, `productDecision: "linked"`, `matchedBy: "alias"` and does not call `suggestProducts` for that line; a null-product hit sets `"none"`; an unresolved line with a known buyer reaches `recordUndecided`. `writePurchaseOrder` calls `learnAliases` inside the transaction with the decided lines and writes `matchedBy` on each `LineItem`; a throwing `learnAliases` does not fail the confirm; a shop confirm writes `matchedBy: "shop"` and learns nothing.
- [ ] FAIL → implement §3 → PASS.
- [ ] Browser (the 2026-09-09 real documents on the development database): confirm a PO whose line prints `ZEN/SC/2100/CARROT` matched by hand to the Carrot product; `SELECT status, "productId", "seenCount" FROM "ProductAlias" WHERE code = 'ZEN/SC/2100/CARROT'` → `LEARNED`, that id, 1. Upload the same PDF again → the review screen arrives with the line already linked and the picker hint "Learned from Star Value Sdn Bhd's orders · 1×"; confirm → `seenCount` 2. Upload a PO from a different buyer printing the same code → the hit is `other`, still offered, still exact.
- [ ] Commit `feat(extraction): remember the reviewer's decisions and use them first`

### Task 4: The review picker

**Files:** `src/app/(portal)/review/[id]/page.tsx`, `src/components/review/ReviewForm.tsx`, `src/components/review/ProductMatchPicker.tsx`

- [ ] `aliasHits: (AliasHit | null)[]` flows page → form → picker; the alias row renders first with its hint; the Phase 12 tests still pass.
- [ ] Browser: the picker shows the alias row above the IDF-ranked ones; choosing a different product and confirming writes `matchedBy: "manual"` and the alias becomes that product (LEARNED). Commit `feat(review): the buyer's remembered code is the first suggestion`

### Task 5: The purchase order and history print the buyer's code

**Files:** `src/lib/po-document/data.ts` (+test), `src/lib/po-document/attach.ts` (pass the codes), `src/lib/queries/client-history.ts` (+test)

- [ ] Failing tests: with `codes = Map { p1 → "ZEN/SC/2100/GM" }` the line reads `code: "ZEN/SC/2100/GM", ourRef: "ZEN-SC-2100-GM-VN"`; a product with no alias reads `code: sku, ourRef: null`. Same for `listClientHistory`'s `code`.
- [ ] FAIL → implement → PASS. Browser: send a shop order for a product the buyer has an alias for → the PDF's line prints the alias with *Our ref* beneath (screenshot); the history row's Code column agrees.
- [ ] Commit `feat(po-document): the buyer's own code above our SKU`

### Task 6: The admin screen

**Files:** `src/app/(admin)/admin/product-codes/page.tsx`, `loading.tsx`, `src/app/(admin)/layout.tsx` (nav), `src/components/admin/AdminNav.tsx`, `src/components/admin/ProductAliasTable.tsx`, `AliasDecisionCell.tsx`, `AliasKpis.tsx`, `AliasFilters.tsx`, `src/lib/queries/product-aliases.ts` (`listProductAliases`, `aliasKpis`), `src/actions/product-aliases.ts`, `src/actions/product-aliases.test.ts`

- [ ] Failing tests: `decideAlias` sets `CONFIRMED` with the decider; `setAliasScope(true)` rewrites `lookupKey` with `*` and maps P2002 to the message; `deleteAlias` deletes; a `MEMBER` is refused on all three; `aliasKpis` divides correctly and yields `null` percentages on empty windows; `listProductAliases` builds the three `ILIKE`s and the buyer/status filters.
- [ ] FAIL → implement §4 → PASS.
- [ ] Browser as super admin (promote and revert as before): the KPIs equal three raw counts; search `CARROT` finds the row; *Needs a decision* lists the UNDECIDED rows on `bg-surface` with the inline Combobox; picking a product turns the chip *Confirmed* and `SELECT status, "decidedById"` agrees; *Apply to any buyer* on a row shows *Any buyer* and a second attempt on a duplicate shows the message; *Delete* removes it. Zero overflow at 390 with rows as cards.
- [ ] Commit `feat(admin): product codes — the aliases, their status, and a place to decide them`

### Task 7: Verification, cleanup, history

- [ ] Suite, types, lint, build; sweep `/admin/product-codes`, `/review/[id]`, a client PO viewer × {390, 768, 1440}.
- [ ] Remove test data: uploaded test documents and their extractions and objects, the test POs, aliases created by the tests (leave real learned ones from real confirms — say which), the member's role reverted; counts before/after.
- [ ] `context/current-feature.md` entry.

## 6. Acceptance criteria

1. Confirming a PO with a hand-matched line writes a `LEARNED` alias for that buyer; the same document re-uploaded arrives pre-linked with the hint, and confirming it counts the alias up.
2. A code from another buyer is offered only when every buyer using it means one product; a disagreement offers nothing.
3. A line decided *not a product* is remembered as such and never suggested as one.
4. `matchedBy` is written on every line of every confirm — alias, sku, manual, new, none, shop — and the KPI's percentage equals a raw query over the last 30 days.
5. The generated purchase order and the history rows print the buyer's alias with *Our ref {sku}* beneath, and our SKU alone where none exists.
6. The admin screen's counts equal raw queries; searching, filtering, deciding, rescoping and deleting each do what they say and are refused to a member.
7. Every Phase 12 test still passes; `resolveProducts`' exact-only rule is untouched.

## 7. Out of scope

- **Fuzzy alias matching** — exact only; ranking stays in the picker.
- **Aliases on the shop's own orders** — a shop order prints no code, so there is nothing to learn; the buyer's alias is *printed* there, not learned.
- **Merging two buyers' aliases** — an admin can rescope one row to any buyer; bulk operations are not drawn.
- **Editing a product's SKU from this screen** — `/products/[id]` does that.

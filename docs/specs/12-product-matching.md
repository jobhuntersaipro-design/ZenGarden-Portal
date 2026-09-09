# Phase 12 — Product matching at review

Branch `feature/product-matching`. Depends on: 04 (extraction, review, confirm),
05 (PO detail), 08 (products), 11 (product codes drive the catalogue).

Goal: a reviewer chooses the catalogue product for every line of a purchase
order before it can be confirmed. Each line arrives with a ranked suggestion
and a confidence score computed from the document's own wording, shows the
market that separates two otherwise identical rows, and carries an explicit
human decision that `confirmPurchaseOrder` then honours instead of overwriting.

## 0. Why this exists

Phase 11 made the printed product code the line's identity: an existing code
links, an unknown one creates. That works when the customer prints our code.
They do not. The 2026-09-09 catalog import found the codes customers actually
print — `ZEN/SC/2100/CARROT`, `ZENSC-R.JELLY2LT` — beside our generated
`ZEN-SC-2100-CR`, and most lines print no code at all, only a description. So
exact-SKU matching misses most lines, and every miss silently *creates* a
product rather than linking the one already there.

Three consequences follow, and this phase is the fix for all three:

1. A line that should link to an existing product creates a near-duplicate.
2. `confirmPurchaseOrder` re-derives `productId` from the typed code, so there
   is nowhere for a human correction to survive even if someone made one.
3. The catalogue grows junk from drafts that were never confirmed.

## 1. Data model

**No migration.** `LineItem.productId` already exists and `Extraction.draftJson`
is JSON, so the new field costs nothing at the database.

`DraftLineItemSchema` in `src/lib/validation/purchase-orders.ts` gains one key:

```ts
/**
 * The reviewer's decision about what this line is. "unset" is the default and
 * blocks Confirm — the point of the field is that a person looked.
 */
productDecision: z.enum(["unset", "linked", "new", "none"]).default("unset"),
```

| Value | Meaning | `productId` |
|---|---|---|
| `unset` | nobody has decided; blocks Confirm | ignored |
| `linked` | this line is that catalogue product | **required** |
| `new` | create a product from this line at confirm | null |
| `none` | not a product — freight, a discount, a rounding line | null |

A `.superRefine` on `DraftLineItemSchema` enforces the third column: a
`"linked"` line without a `productId` fails validation rather than saving a
decision that points at nothing.

`"none"` is new capability, not tidying. POs carry non-product lines, and today
they land as `productId: null` indistinguishably from "nobody looked".

**The two drafts sitting in the review queue** parse with `productDecision`
defaulting to `"unset"`, which is exactly right: they were never reviewed under
this rule, so they must be.

## 2. Scoring — `src/lib/extraction/match-products.ts`

A new pure module. No Prisma import, no I/O, no `async`. It takes the lines and
a catalogue snapshot and returns ranked candidates per line.

```ts
export type Candidate = { productId: string; score: number };

export function matchLine(
  line: { description: string; sku: string | null },
  catalogue: CatalogueEntry[],
  idf: Map<string, number>,
): Candidate[];   // top 5, descending, score >= SUGGEST_MIN only

export function buildIdf(catalogue: CatalogueEntry[]): Map<string, number>;
```

`CatalogueEntry` is `{ id, sku, name, brand, variant, market, packSize, unit }`.

### The ladder

Two branches, and which one a candidate takes is decided first.

**Identity branch.** One of these holds, the score is returned as written, and
**no bonus, penalty or cap below applies** — the evidence is already conclusive:

| Signal | Score |
|---|---|
| `normaliseSku` equality | 100 |
| SKU equality after stripping `- . _ / +` and spaces | 96 |
| Name equality, case- and punctuation-insensitive | 92 |

**Similarity branch.** Nothing identical: weighted token overlap, then the
adjustments below, then **clamped to 0–90**. The clamp is what keeps the ladder
meaningful — a similarity score can never reach the 92 a name equality earns,
so a suggestion cannot impersonate the Phase 11 exact rule however many tokens
happen to line up.

### Token overlap is weighted by inverse document frequency

Production holds 309 products and most of their names open with the same words.
A plain overlap score gives `ZEN GARDEN SHOWER CREAM 2.1L GOAT'S MILK` a strong
match against every shower cream in the catalogue, because four of its six
tokens are shared by two hundred rows.

`buildIdf` therefore weights each token by `log(N / rows containing it)`, so
`CHAMOMILE` counts for far more than `ZEN` or `SHOWER`. Tokens come from the
product's `name`, `brand` and `variant` joined, normalised the way `sku.ts`
already normalises (`normalise()` — lowercase, strip apostrophes, split on
non-alphanumerics).

The IDF map is built **once per document**, not once per line.

### Size is near-decisive

Both sides are parsed for a size using the grammar `sizeCode` already
implements in `src/lib/sku.ts` — `2.1L`, `500ML`, `2.9KG`, normalised to a
number of millilitres or grams. Similarity branch only:

- Both present and equal → **+18**
- Both present and different → **the score is capped at 40**
- Either absent → no adjustment

The cap is the important half. `EVERFRESH B SHAMPOO 2.1L` and
`EVERFRESH B SHAMPOO 500ML` share every word they have; without the cap, token
overlap alone ranks the wrong size first and misprices the order. A size
disagreement is the strongest evidence in the document that two lines are
different products, and it must outrank any amount of wording overlap.

### Brand and variant agreement

Similarity branch only: `+8` where the line's text contains the product's
brand, `+10` where it contains the variant. Additive rather than gating — a
document that omits the brand is common and must not be penalised. Raw overlap
tops out at 85, so a candidate agreeing on brand, variant and size reaches the
0–90 clamp, which is the intended shape: strong, never certain.

### Market is displayed, never scored

Documents almost never print the destination market, so scoring it would add
noise to every line. But the catalogue holds one product per variant × market,
so market is frequently the *only* difference between two candidates scoring
identically — which makes it the thing a reviewer needs in front of them.
It is therefore rendered on every candidate row and never enters the score.

### Constants

```ts
export const SUGGEST_MIN = 45;   // below this, no candidate is offered at all
export const STRONG_MATCH = 85;  // at or above, the chip reads green
```

Nothing auto-selects. A score pre-fills the picker; the line stays `"unset"`
until a person acts.

## 3. `resolveProducts` splits, and extraction stops writing

`src/lib/extraction/resolve-products.ts` is doing two jobs — deciding what a
line points at, and creating products — at a moment when nobody has confirmed
anything. It becomes two:

- **`suggestProducts(lines)`** — used by `src/lib/extraction/run.ts`. One read
  of the active catalogue, `buildIdf` once, `matchLine` per line. **Writes
  nothing.** Returns each line's ranked candidates, and pre-fills `productId`
  with the top candidate where it scores 100 (an exact code match, the Phase 11
  rule) so the picker opens on the right row — still `"unset"`.
- **`createProductsForLines(tx, lines)`** — used by `confirmPurchaseOrder`
  inside its existing transaction, for `"new"` lines only. This is the current
  create block moved, keeping `normaliseSku`, `skipDuplicates`, the re-read for
  a raced code, `category: "Uncategorised"` and `needsReview: true`.

### This reverses a Phase 11 decision, deliberately

Phase 11 created products at extraction time and recorded the known cost: *"a
discarded draft leaves its products behind — the user chose this over creating
them at confirm, and `needsReview` is what makes the junk visible rather than
silent; moving creation into `confirmPurchaseOrder`'s transaction is the fix if
it proves noisy."*

The reason for that choice was that nobody should hand-pick twenty products on
a twenty-line order. An explicit per-line decision now exists, so extraction-time
creation buys nothing that the suggestion does not already buy, and the
discarded-draft junk goes away with it. This is the fix Phase 11 named.

## 4. Confirm honours the decision

In `confirmPurchaseOrder` (`src/actions/purchase-orders.ts`), the
`resolveProducts` call **is removed**. It is what currently overwrites a human
choice with whatever the typed code resolves to.

In its place, inside the transaction:

| Decision | What is written |
|---|---|
| `linked` | `productId` as chosen, after re-reading the row to confirm it exists and is `active` |
| `new` | created by `createProductsForLines`, its id linked |
| `none` | `productId: null` |
| `unset` | unreachable — the server gate rejected the draft |

`LineItem.sku` still stores the code as printed. It is what the document says
and the PO detail screen shows it; it simply no longer decides the link.

### The server gate

Beside the existing totals gate, and phrased the same way:

```ts
const undecided = data.lineItems.filter((l) => l.productDecision === "unset");
if (undecided.length > 0) {
  return { success: false, error: "Every line needs a product." };
}
```

A `"linked"` line whose `productId` has since been archived or deleted fails
the same way, naming the line — the draft may have sat in the queue for days.

## 5. Review UI

### The picker

`src/components/review/ProductMatchPicker.tsx`, composing the existing
`Combobox` rather than forking it. Options are ordered:

1. Candidates from `matchLine`, best first, each labelled
   `ZEN-SC-2100-GM-VN · Goat's Milk · 2.1L · Vietnam · 6/carton`
2. The rest of the active catalogue, alphabetically

The label carries the searchable text on purpose: `Combobox` filters by
`label.includes(needle)`, so typing `vietnam` or a code both work, and its
`options.slice(0, 50)` default then shows the ranked candidates first rather
than fifty arbitrary products.

### One small change to `Combobox`

It gains an optional `pinned?: ComboboxOption[]`, rendered at the foot of the
list and **never filtered by the query**. The two decision rows —
*Create new product from this line* and *Not a product* — must stay reachable
when the reviewer has typed a search that matches nothing, which is exactly
when "create new" is the answer. The buyer picker passes no `pinned` and is
unchanged.

### The score chip

On the selected match, reusing the Phase 04 confidence vocabulary rather than
inventing a second one:

| Score | Reads |
|---|---|
| ≥ `STRONG_MATCH` (85) | green |
| `SUGGEST_MIN`–84 | amber, the same amber as `LOW_CONFIDENCE` |
| No suggestion | grey "No match" |

A confirmed line shows a check, not a chip: once a person has decided, the
machine's opinion is history.

### The printed code stays

The existing code `Input` remains in the first column, editable, feeding
`LineItem.sku`. Editing it **re-runs `matchLine` for that row** so a corrected
code re-ranks the candidates — but it no longer sets `productId`, and it does
not move the row out of `"unset"`.

### "Accept all N exact matches"

A button above the table, enabled when any `unset` line has a 100-scoring
candidate, setting exactly those lines to `"linked"`. The gate stays literal —
every line needs a decision — while a twenty-line order whose codes all match
is one click rather than twenty.

### Layout

The line-items table is already 840px (`--spacing-line-items`) and scrolls
inside `useEdgeFades`. The first column grows from `w-44` (176px) to `w-72`
(288px) for the picker and the chip, so **`--spacing-line-items` goes to
952px** in the same commit — the `<col>` widths are authoritative under
`table-fixed` and the token is what the scroller measures, so the two must move
together or the columns and the container disagree. **The table must not push the page sideways** —
that regression is on record from Phase 11 and `min-w-0` on both wrappers is
what holds it.

## 6. Tests

Scoring is pure, so it is tested against the codes and names production
actually holds rather than invented ones:

| Case | Expectation |
|---|---|
| `ZEN-SC-2100-GM-VN` against itself | 100 |
| `ZEN/SC/2100/CARROT` vs `ZEN-SC-2100-CR` | 96 — separators differ, nothing else |
| `ZENSC-R.JELLY2LT` | ranks its royal-jelly row first |
| `KE218441 68216` (a space) | survives `normaliseSku`, scores 100 against itself |
| `EVERFRESH B SHAMPOO LVD& CHAMOMILE 2.1L` | ranks above the same name at 500ML |
| Same name, 2.1L vs 500ML | the 500ML row caps at 40 |
| `ZEN GARDEN SHOWER CREAM` against 200 shower creams | no candidate reaches `STRONG_MATCH` |
| A line with no description and no code | returns `[]` |
| Two products differing only by market | both offered, both scoring equally |

Plus: `buildIdf` weights a rare token above a ubiquitous one; the confirm gate
rejects an `unset` line; a `linked` line pointing at an archived product fails
by name; `createProductsForLines` creates only `"new"` lines; and a discarded
draft creates nothing at all — the regression Phase 11 accepted and this phase
removes.

## 7. Acceptance criteria

1. A PO whose lines print our exact codes arrives with every line suggested at
   100 and is confirmable in two clicks — *Accept all exact matches*, Confirm.
2. A PO whose lines print only descriptions arrives with ranked suggestions,
   and the right product is in the top 5 for a line naming brand, size and
   variant.
3. Confirm is disabled while any line reads *Choose a product*, with a lock
   message beside it in the manner of the totals gate.
4. A product chosen by hand survives Confirm — the saved `LineItem.productId`
   is the chosen one even where the printed code resolves elsewhere.
5. Two products differing only by market are told apart in the picker without
   opening another screen.
6. A discarded draft creates no products.
7. *Not a product* confirms with `productId: null` and no product created.
8. No horizontal page overflow at 390px, 768px and 1440px.

## 8. Out of scope

- **Teaching the extraction prompt the brand/size/variant shape.** The scorer
  reads the description as extracted. Revisit only if criterion 2 proves short
  in real use; it is a prompt change, not a matching change.
- **Recording the score on the confirmed `LineItem`.** Nobody has asked to read
  it back, and it would need a migration to store.
- **Merging the near-duplicate products Phase 11 already created.** A separate
  data job; this phase stops the bleeding rather than cleaning the wound.
- **The super-admin vocabulary screen** — adding a category, unit, brand,
  variant, market or pack size from the UI. Specced separately as Phase 13 and
  built after this merges.

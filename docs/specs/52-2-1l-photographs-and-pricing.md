# Phase 52 — Photographs for the 2.1L blocks, and the deadlock behind them

Version 1.0 — 2026-09-21. Audience: AI coders, and the person deciding scope.
Read `docs/specs/00-master.md` first. Status: **spec only. Nothing run against
any database.**

---

## 1. Why this exists

Asked for as: *"can you help to create new products from this file? Just
include Super Indo product, Zen 2.1L Normal/DIY (6), Lotus's 2.1L (6). Please
search online for the product images."*

The products already exist. What does not exist is a photograph of any of them,
and that turns out to be the thing stopping the whole catalogue — not a
cosmetic gap. This spec records what is really there, the chain that is
actually blocked, and the decisions that belong to the business rather than to
a coder.

## 2. What the attached file is, measured

`scripts/pdf-to-labels.py` read the PDF supplied on 2026-09-21 and returned
**360 row bands, 336 label rows** — a list **identical, row for row, to
`docs/imports/zen-garden-dc-inventory-2026.labels.json`**, the extraction
stored on 2026-09-09. Compared by value in both directions: no row in one that
is not in the other.

**So the file carries nothing new.** It is the same master list the catalogue
was built from. Anything "missing" from the portal is missing for a reason
other than never having been imported.

## 3. The twenty products, and where they already are

`toProducts` — the real parser, run offline against the three blocks filtered
out of that file — yields **20 products, 0 duplicates, 0 skipped**:

| Block | Products | SKUs | Market | Pack | Pallet |
|---|---|---|---|---|---|
| `ZEN 2.1L NORMAL/DIY (6)` | 8 | `ZEN-SC-2100-{GM,LV,PP,RJ,GT,CR,AV,OM}` | — | 6 | — |
| `SUPER INDO 2.1L (6) 60CTNS/PALLET ZEN SIGNATURE` | 6 | `ZEN-SC-2100-{GM,LV,PP,RJ,GT,CR}-ID` | Super Indo | 6 | 60 |
| `LOTUS 'S 2.1L (6) 60CTNS/PALLET` | 6 | `ZEN-SC-2100-{GM,LV,PP,RJ,GT,CR}-LOTUS` | Lotus | 6 | 60 |

Every one of those twenty SKUs appears in
`docs/imports/product-families-2026-09-15.json` — the development catalogue as
it stood on 2026-09-15 — under family `ZEN-SC-2100`, *Zen Garden Shower Cream
2.1L*. **Creating them would create nothing.**

**Not verified:** that production matches. No production or development
database was read for this spec; see §9.

## 4. The deadlock

This is the finding that matters, and it is not specific to these twenty.

1. A product shows in the shop only when it is **active**, off **Needs
   review**, and carries a **list price above zero** (`summarise()` in
   `src/lib/queries/products.ts`).
2. `import-catalog.ts` creates every product from the sheet at **`listPrice`
   0.00 with `needsReview: true`**, deliberately — the sheet carries no prices,
   and the *Needs review* chip is meant to be the pricing worklist.
3. A price is set in one place: the product edit drawer, through
   `updateProduct`.
4. `updateProduct` **refuses to save a product that has no images** —
   `NEEDS_AN_IMAGE`, `src/actions/products.ts:609`. Phase 27 added it on
   purpose.
5. **All ~308 imported products have no images.**

So: **no photograph → no save → no price → invisible in the shop.** The
photographs are not decoration on top of a priced catalogue; they are the first
link in the only chain that gets anything into the shop at all. That is why
this request is worth a phase rather than a one-off copy of some files.

Archiving is deliberately *not* gated the same way, so an imported product can
still be archived without a photograph. Only saving is blocked.

## 5. What re-running the importer does, exactly

Read from `scripts/import-catalog.ts` rather than assumed, because running it
over twenty products that already exist is the proposed first step.

**Safe:** on a SKU that already exists the importer calls `update` with
`{name, brand, variant, packSize, cartonsPerPallet, market, category, unit}`
only. `listPrice` and `needsReview` appear **only** in the `create` branch. A
price somebody has already set, and a review flag somebody has already cleared,
both survive a re-run untouched.

**The cost, stated:** that update **overwrites the name** with the sheet's
wording. If anyone has renamed one of these twenty in the portal — say from
`2.1L — Goat's Milk` to something a buyer would recognise — the re-run puts the
sheet's version back. Same for brand, variant, pack size, pallet count, market
and category.

**Decision for the user (D1):** re-run the importer over these twenty at all,
or leave the rows alone and go straight to photographs? The only thing a re-run
buys is correcting fields against the sheet, and the sheet has not changed
since they were imported. **Recommendation: skip it.** It cannot help and it
can revert a hand-edit.

## 6. Photographs

### 6.1 Eight photographs, twenty products

Super Indo, Lotus's and NORMAL/DIY are the **same bottle sold to three
different customers**. One photograph per flavour serves all three blocks:
**8 unique photographs across 20 SKUs.**

`scripts/import-product-images.ts` matches a file to a product by its basename
and never fuzzy-matches, so each photograph has to exist once per SKU.
`scripts/fan-out-variant-images.ts` does that copying from one file per
flavour; the file names are listed in
`docs/imports/zen-garden-2.1l-image-sources.md`.

### 6.2 What the importer does to each file

Same pipeline as the upload route: `rotate()` for EXIF, fit inside 1600px
without enlarging, WebP at quality 82, stored in R2 with a thumbnail. Limits:
**8 images per product, 5 MB per file**, `.jpg` `.jpeg` `.png` `.webp`.

### 6.3 Where the photographs come from

**Decision for the user (D2), and it is theirs, not a coder's.** Three options,
in the order I would take them:

1. **The customer's own photographs.** Zen Garden is this business's own brand
   — "we are the supplier", as Phase 24 put it. Their product shots need
   nobody's permission, will match the bottle actually shipped, and will not go
   stale when a retailer re-shoots. <https://www.lovinghands.my/products/> is
   their own site and lists the range.
2. **Retailer listings.** A search returned 2.1L pages for six of the eight
   flavours (Sunway Multicare, AA Pharmacy, MR. D.I.Y., Lulu, and others;
   collected per flavour in `zen-garden-2.1l-image-sources.md`). These are
   photographs of this business's own product taken by somebody else — usable
   in practice, but somebody should decide that rather than have it decided by
   a script.
3. **Photograph the bottles.** Eight bottles, one afternoon, and the result is
   consistent and unambiguously theirs.

**Nothing has been downloaded and no page has been opened** — see §9.

### 6.4 Avocado and Oat Milk have no photograph anywhere public

A search found **no 2.1L listing at all** for either. They appear in the master
list's NORMAL/DIY block and nowhere a search could reach, so they are probably
newer than the retailers' pages.

`fan-out-variant-images.ts` reports a flavour it has no file for and skips it,
rather than borrowing another flavour's bottle. **A catalogue that shows the
Carrot bottle under Avocado is worse than one that shows nothing** — it is the
same failure `import-product-images.ts` refuses to risk, and nobody downstream
can see it happened.

So `ZEN-SC-2100-AV` and `ZEN-SC-2100-OM` stay unphotographed, and therefore
unpriceable and shop-invisible, until the customer supplies two photographs.
**Decision for the user (D3):** supply them, or archive those two.

### 6.5 Pricing is not in this phase

The master list carries no prices and neither does this spec. Once a product
has a photograph, somebody with the price list opens the edit drawer and types
it. **Decision for the user (D4):** who, and from what source? Eighteen
products is a sitting, not a project — but nothing here can guess a figure, and
a wrong list price misprices every order that quotes it.

## 7. Plan

Ordered so each step is checkable before the next one costs anything.

| # | Step | Command | Checked by |
|---|---|---|---|
| 1 | Read the live catalogue | — | Confirm the twenty SKUs exist, and read their `listPrice`, `needsReview` and image count. This decides whether §3 holds on production. |
| 2 | *(optional, D1)* Refresh the rows | `import-catalog.ts --labels docs/imports/zen-garden-2026-09-21-three-blocks.labels.json --dry-run` first | `Created 0, updated 20` |
| 3 | Gather 8 photographs (D2) | — | A person looks at each one: right flavour, right 2.1L bottle |
| 4 | Fan out to SKU names | `fan-out-variant-images.ts <in> <out> --dry-run` first | 18 files, 6 flavours, Avocado and Oat Milk named as missing |
| 5 | Load them | `import-product-images.ts <out> --dry-run` first | Every file matched; **zero unmatched** |
| 6 | Read back | — | Each of the 18 has one image, a `thumbKey`, and both R2 objects resolve |
| 7 | Price them (D4) | edit drawer | The save is accepted — which is the proof §4's deadlock is broken |
| 8 | Confirm in the shop | — | The 18 appear; the 2 without photographs do not |

## 8. Acceptance criteria

1. The twenty SKUs in §3 exist, once each, in the target database — no
   duplicates created by anything in this phase.
2. Eighteen of them carry exactly one image, cover position 0, with both the
   full object and the thumbnail readable from R2.
3. `import-product-images.ts` reports **zero unmatched files**. A single
   unmatched file means a SKU was typed wrong and the run is not accepted.
4. No photograph appears under a flavour that is not its own — checked by a
   person against the rendered product pages, not by the script.
5. `ZEN-SC-2100-AV` and `ZEN-SC-2100-OM` carry no image and no invented one.
6. Any product that already had a price or a cleared review flag still has it.
7. Once priced, a product saves from the edit drawer without `NEEDS_AN_IMAGE`,
   and appears in the shop.

## 9. What this container cannot do, and why the spec stops where it does

Both limits were measured on 2026-09-21, not assumed.

- **No database.** The Vercel CLI answers `loggedIn: false, login_required`,
  and the Neon connector is not authorised for this session. So §3's claim was
  checked against the committed 2026-09-15 snapshot, not against a live
  catalogue, and nothing in §7 step 1 has been run.
- **No egress.** The proxy allows the package registries and refuses
  everything else. `curl` and the fetch tool both returned `EGRESS_BLOCKED` on
  the customer's own site and on every retailer. **No product page was opened
  and no image was downloaded.** Web *search* works, because it is relayed, so
  §6.3's list is search-result titles and URLs — a starting point for a person
  with a browser, explicitly not a verified match.

Getting past the first needs a `VERCEL_TOKEN` or the Neon connector
authorised. The second is not a credential problem: the photographs have to be
handed over as files.

## 10. Not in this phase

- **The other ~288 imported products**, which sit behind exactly the same
  deadlock. If §4 is worth fixing it is worth fixing at 308, not 20 — but the
  request was for three blocks, and the mechanics prove out the same either
  way.
- **Changing the rule in §4.4.** Letting a product be priced without a
  photograph would unblock the catalogue in one line, and would undo a
  deliberate Phase 27 decision. Worth raising; not worth doing quietly.
- **The 28 rows in 5 blocks the master list has never imported** (hair gel,
  sanitisers, Friends 300ML, Kimia Suchi) — recorded since 2026-09-09, still
  needing a person to enter them.
- **Anything the rest of the master list holds** — stock, consignments,
  delivery dates. That is Phase 51 and the demand board.

## 11. Open questions

| | Question | Why it is not mine to answer |
|---|---|---|
| D1 | Re-run the importer over the twenty, or leave the rows alone? | It can revert a hand-edited name, and buys nothing the sheet has not already given. Recommendation: leave them. |
| D2 | Whose photographs — the customer's own, a retailer's, or new ones? | A rights and brand decision. |
| D3 | Avocado and Oat Milk: supply two photographs, or archive them? | Only the business knows whether those two are still sold. |
| D4 | Who prices the eighteen, from what price list? | No price exists anywhere in the portal or the sheet. |

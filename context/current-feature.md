# Current Feature

## Status

**Phase 17 — shop shell and guest browsing — landed** (`feature/shop-shell`).
Plan: `docs/specs/design/shop/17-shop-shell.md`; the six-phase storefront plan
(17–22) and its decisions are indexed in `docs/specs/design/shop/00-overview.md`,
written 2026-09-10 from the storefront canvas. Phases 12, 14, 15, 16 and now 17
have landed — see History. Next up: Phase 18,
`docs/specs/design/shop/18-checkout-and-sending.md`. The shop still shows only
`active && !needsReview && listPrice > 0`, and production still holds 309
products at RM 0.00 — pricing the catalogue is the customer's and remains the
blocker for anything to sell there. Development's own catalogue was a
different story and got repaired this phase — see History — so it now has 308
sellable products for Phases 18–22 to build against.

Also outstanding from the catalog import: enter the 5 nested-sub-table blocks
by hand, clear the 2 drafts in the review queue, and delete one of the duplicate
`SVPPPO26090009` orders once the right buyer name is settled.

**Phase 23 — customer profiles — landed** (`feature/customer-profiles`,
6 tasks, spec `docs/specs/23-customer-profiles.md`, plan
`docs/specs/plans/2026-09-11-customer-profiles.md`). Independent of the 18–22
storefront sequence above — it depends on Phase 15 (the CLIENT role) and
Phase 07 (buyer detail), not on the shop phases. Ops can now create a customer
— company, contact, an internal remark, and an optional shop login — from
`/buyers/new` in one screen, edit that remark and its contacts afterward, and a
customer can change their shop password more than once. See History for what
was measured. **Not yet merged to `main`** — the branch is intact pending the
user's own decision to merge and delete it.

## Goals — storefront

- A buyer's own staff sign in on their own host and see only their own company,
  **without any of the existing ops queries learning what a tenant is**. The
  portal has no multi-tenancy today: `User` is ops-only, `Buyer` has no login
  link, and every query is unscoped by design.
- A web order lands as a `WebOrder` and becomes a `PurchaseOrder` only when a
  person confirms it — through the same writer, the same totals gate and the
  same duplicate check as a scanned PO. The bar does not drop because the
  intake changed.
- `PurchaseOrder.documentId` becomes nullable rather than synthesising a
  `Document` that names an R2 object nobody uploaded. **The inner joins in
  `src/lib/queries/po-list.sql.ts:208-209` must become `LEFT JOIN` in the same
  commit**, or every web-order PO silently vanishes from the list, its money
  summary, the needs-review count and the buyer page — with no error and no type
  failure.
- The cart stores product ids and cartons and **never a price**, so the price on
  screen is always today's; the snapshot happens inside `submitWebOrder`'s
  transaction. A stale price is not unlikely, it is unrepresentable.
- Cartons need no conversion: `unit` is already `"carton"` and `listPrice` is
  already per carton, so the client's cartons *are* `LineItem.quantity`.
- Nothing internal reaches the shop. `PurchaseOrder.notes`, `PoStageEvent.note`
  and the ops names and avatars are all invisible there, enforced by an explicit
  narrow `select` rather than by remembering.

## Goals — catalog (delivered)

- A product carries its brand (ZEN GARDEN, MR. KING, L.HANDS…), its variant
  (Goat's Milk, Lavender, Lemon…) and its pack size (pieces per carton), so
  the name no longer has to carry all three and the catalog can filter by
  brand.
- The category list becomes the nine the customer's goods actually fall into:
  Shower cream & gel · Hand wash & soap · Hair care · Body care · Hand
  sanitizer · Dishwash & cleanser · Laundry detergent · Fragrance ·
  Uncategorised.
- SKUs follow `{BRAND}-{TYPE}-{SIZE}-{VARIANT}-{MARKET}` (`ZEN-SC-2100-GM-VN`),
  generated from those fields by `src/lib/sku.ts` and editable afterwards.
- `scripts/import-catalog.ts` reads the XLSX — merged cells carry brand and
  market — into one Product per variant × market with `needsReview: true`, so
  every import lands in the existing *Needs review* chip until its price is
  confirmed. On production it first deletes the landscaping demo data.
- The seed describes the real business: a ZEN-shaped catalog replaces the
  twelve landscaping products, keeping the array shape the PO generator reads.

## Notes

- Decisions taken 2026-09-08 from the sheet review: one Product per variant ×
  market (~150–250 rows), categories as above, SKUs generated, prices entered
  later behind `needsReview`, production demo data deleted by the import.
- Brand and variant use the same grow-by-typing picker as market, so
  `MarketPicker` generalises into one `GrowingListPicker` rather than three
  copies.
- `listPrice` is required, so an unpriced import lands at `0.00`.
  `productStats` already returns `vsListPercent: 0` for a zero list price; the
  detail page must not then print "0.0% above list on average" for a product
  that simply has no price yet.
- Customers' POs name products by description, not by our generated SKU, so
  exact-SKU matching will miss most lines until the extraction prompt learns
  the brand/size/variant shape. Separate work, raised after the import.

## History
- 2026-09-11: Phase 23 — customer profiles — built and verified across six
  tasks on `feature/customer-profiles` (spec `docs/specs/23-customer-profiles.md`,
  plan `docs/specs/plans/2026-09-11-customer-profiles.md`). **Not merged —
  stopped for the user's own review**, per the plan's own final step. Three
  columns (`Buyer.remark`, `User.username`, `User.phone`) in one migration,
  `20260911090000_customer_profiles`; **`username` is a display handle shown in
  ops and, from Phase 21, on the customer's own settings screen, and is never a
  credential** — nothing in the sign-in path looks it up, pinned by a test.
  `/buyers/new` creates a customer — company, contact, an internal remark and
  an optional shop login — in one screen and one action; the remark and a
  buyer's contacts can be edited afterward; a customer can change their shop
  password more than once, closing the loop the Phase 15 invitation email
  opens.
  **The leak assertion, and it was seen to fail before it was trusted to
  pass.** `Buyer.remark` is internal and a shop page reads a `Buyer` in exactly
  one place — `loadShopViewer` (`src/lib/shop-viewer.ts:24`), which supplies
  the company name to the shop header and account menu. `notifyOps` and
  `loadWebOrderForReview` look like the same kind of read and are not: the
  first composes an email to ops staff, the second feeds the ops review
  screen, which already selects `notes` on purpose — neither renders to a
  customer, so neither got an assertion. `shop-viewer.test.ts` now asserts
  `select.buyer` equals `{ select: { name: true } }` by equality, not subset,
  so widening it later has to be a deliberate edit to that one line.
  **Confirmed to actually catch a leak, not just to exist**: with the test
  passing, `remark: true` was added to the shop-facing `select` — the test
  failed, printing the added key in the diff — then `git checkout --
  src/lib/shop-viewer.ts` reverted it and the same run passed again.
  **A defect the browser found that the unit tests passed over.**
  `uniqueMessage` read `meta.target` for a Postgres unique-violation message,
  but Prisma 7's driver adapter emits
  `meta.driverAdapterError.cause.constraint.fields` (with
  `cause.originalMessage` naming the constraint, e.g. `Buyer_name_key`) — a
  shape the original unit tests never saw, because they hand-built the flat
  `{ target: [...] }` object their own mocks expected. Every real duplicate
  therefore fell through to the generic "Something about that customer is
  already in use." Reproduced against a real P2002 on the development
  database and fixed to read the driver-adapter shape (falling back to the
  flat one for any caller Prisma didn't route through the adapter); all three
  collisions — `Buyer_name_key`, `User_username_key`, `User_email_key` — now
  return their own message, verified live in a browser as "Another customer
  already has that name.", "That username is taken." and "That email address
  is already in use." respectively.
  **The second latent defect: a partial patch could not be saved at all.**
  `buyerPatchSchema`'s `emptyToNull` fields (contactName, email, phone,
  address, paymentTerms, remark) were nullable but not optional, so a patch
  naming only `{ remark: "…" }` failed validation before ever reaching
  `updateBuyer` — every one-field edit on the buyer details card would have
  been rejected. The shared `emptyToNull` builder was made `.optional()`, and
  the fix was verified rather than trusted on the report alone: an omitted key
  is absent from `parsed.data` entirely (`hasOwnProperty` false), so
  `updateBuyer`'s spread never sends it to Prisma and a partial patch touches
  only the fields it names — the same data-loss class the uniqueMessage
  investigation was already watching for, checked and ruled safe.
  **A third defect, found by the final whole-branch review after everything
  else had passed: the screen said an invitation was sent when none was.**
  `src/lib/email.ts` is documented "Never throws" — it returns
  `{ sent: boolean }`, and a Resend API error, a bad recipient, a network
  failure and the placeholder-key case local runs hit all resolve
  `{ sent: false }`. `sendInviteEmail` awaited it and returned `true`
  regardless, so `createCustomer` reported `invite: "sent"` and `/buyers/new`
  toasted "Customer created and invitation sent." while the mail sat in no
  outbox — ops would have told the customer to check an inbox that stays
  empty. Acceptance criterion 2 was false for the whole build until this was
  fixed. **Both things that were supposed to prove that path exercised a
  contract the code cannot produce**: the unit test used
  `sendEmail.mockRejectedValue`, and the browser proof forced the failure by
  editing `email.ts` to throw. That is the third test on this branch to pass
  by asserting its own mock rather than the real contract — after the
  `meta.target` shape above, and the same class as Phase 16's vacuous
  `deletePurchaseOrder` call. The helper now returns `sendEmail`'s own `sent`
  and keeps its try/catch only as a fail-closed backstop; the new test
  resolves `{ sent: false }`, was watched failing against the unfixed code
  (`invite: "sent"` where `"failed"` was expected), and asserts the `Buyer`
  and `User` rows survive rather than only checking the returned string.
  **Left alone deliberately:** `inviteBuyerContact` and `resendClientInvite`
  still ignore the send result and toast "Invite sent." either way. That is
  pre-existing behaviour this branch did not introduce, and what those toasts
  should say is a product decision rather than a defect to fix in passing.
  **The password loop was driven end to end and the stale password's failure
  was read from the wire.** A customer invited from `/buyers/new`, signed in
  with the temporary password, was forced to `/account/password`, changed it,
  and the *old* password's next sign-in attempt did not merely toast an
  error — `POST /api/auth/callback/credentials` itself returned 200 with
  `error=CredentialsSignin&code=credentials` in the body, read directly rather
  than inferred from the UI. The new password then signed in cleanly from the
  shop host's own account menu, which now carries a working "Change password"
  row where Phase 15 left only *My orders*, *Talk to our team* and *Sign out*.
  **The 2026-09-10 `shop.localhost` Chrome issue recurred**, in this same
  checkout, across more than one of the six tasks: Chrome refused every
  connection to `shop.localhost` while `curl` on the same machine reached it
  instantly. The same recorded workaround was used again — a shell-exported
  `SHOP_HOST`/`SHOP_URL` pointing the browser at `foo.localhost` against the
  identical running server, confirmed behaviourally identical by `curl` first,
  no file changed, nothing committed.
  **The overflow sweep — nine combinations, all clean.** `/buyers`,
  `/buyers/new` and a buyer detail page carrying a remark and two contacts (set
  up directly against the development database for the sweep, since no
  existing buyer had either, and removed afterward) were each measured at
  390/768/1440: `document.documentElement.scrollWidth === window.innerWidth`
  on all nine. At 390 the only sub-44px interactive elements were the
  already-accepted classes — the `SkipLink` (visually off-canvas until
  keyboard focus, not a touch target at rest) and plain-text row links (buyer
  names, PO numbers) inside `DataTable` card mode, the same category named
  "product names, footer rows" in the 2026-09-10 entry. **One new
  finding, not on that accepted list**: `/buyers/new`'s "Give them a shop
  login" control is the shared shadcn `Switch` (`src/components/ui/switch.tsx`,
  already used by `ProductForm`, `ProductSheet` and `UserDrawer`) at 32×18px
  visually — its `after:-inset-x-3 after:-inset-y-2` hit-area padding brings
  the effective target to roughly 56×34px, still short of the 44px floor this
  spec's own global constraints name. It predates this phase and was not
  introduced by anything in these six tasks' diffs, so it was left unfixed —
  Task 6's own file scope is `shop-viewer.test.ts` and this file — and is
  flagged here rather than silently folded into the accepted list, per the
  brief's own rule that a new one is a defect to record as found, not to wave
  through.
  **Four deferred minors, carried forward rather than fixed:** an unused
  `username` in a destructure lint-warns in **two** files, not one —
  `src/actions/clients.test.ts:145` and `src/lib/validation/clients.test.ts:57`
  — both from the plan's own verbatim test code (warns, does not fail);
  `uniqueMessage`'s generic fallback still stands for a P2002 that carries
  neither shape; `/buyers/new`'s submit button keeps "Create customer" while
  pending rather than switching to "Creating…" as `ProductForm` does; and
  while a shop contact is being edited, its status text and Resend/Disable
  buttons are hidden along with the caption, not just the caption alone.
  **Verification: 688/688 tests (687 plus the one leak assertion), `tsc`,
  lint (2 pre-existing warnings, 0 errors) and `build` all clean.**
  **Cleanup, counted before and after**: `buyer.count()` 11 → 11,
  `user.count()` 2 → 2, `user.count({ role: 'CLIENT' })` 0 throughout,
  `webOrder.count()` 0 throughout — all five earlier tasks' own test data was
  already gone when this task started, verified independently rather than
  trusted. `aisha@lovinghandsportal.com`, promoted `MEMBER` → `SUPER_ADMIN` in
  Task 3 for its own browser checks, was read back as `SUPER_ADMIN` and
  reverted to `MEMBER`, confirmed by re-reading the row. This task's own sweep
  fixture (Northwind Traders' remark, two `CLIENT` contacts) and the one
  `LoginAttempt` row its own sign-in produced were all removed, `loginAttempts`
  returning to the pre-existing 52.
  **Not verified:** anything on production — this branch has never been
  deployed and no production database was touched. The ops upload → extract →
  confirm write path is untouched by this branch's files and was not
  exercised. Phase 21 (`docs/specs/design/shop/21-customer-settings.md`), the
  customer's own settings screen, stays out of scope here as the spec says —
  the password-change row added to the shop account menu is the one piece of
  that screen this phase needed.
- 2026-09-10: Phase 17 — shop shell and guest browsing — built, verified end to
  end and merged (`feature/shop-shell`, spec `docs/specs/design/shop/17-shop-shell.md`).
  **The shop is public now.** A guest reaches `/`, `/products`, a product page
  and `/cart` on the shop host with no session and all four render — read from
  the wire, not the browser: `curl` against `shop.localhost` returned 200 on
  all four, `/orders` came back 307 to `/signin?next=%2Forders`, and the same
  guest hitting `/shop` on the *portal* host got 307 to
  `/signin?next=%2Fshop` — not a literal 404. That last reading is not a
  regression: Task 3 recorded the identical finding when this phase started —
  an unauthenticated request never reaches the pinned-404 branch in
  `src/proxy.ts`, because it returns from the earlier `!session?.user` guard
  first. The 404 is real, but it is the *signed-in staff* case; acceptance
  criterion 1's "genuine 404" holds for a member's session, not a guest's, and
  that half of the proxy is unchanged since Task 3.
  **Known, not fixed — the same status gap, on a product page, measured
  directly.** A hidden or nonexistent product also answers 200 rather than
  404: `GET /products/<an inactive product id>` and
  `GET /products/does-not-exist` both returned HTTP 200, both bodies
  containing "Page not found"/"404", and **zero** occurrences of the hidden
  product's own name (`ZEN ROLL ON — Sportz`) in either — nothing leaks, only
  the status is wrong. This is app-wide and structural to the streaming
  layout — a nonexistent id behaves identically to a hidden one — not
  introduced by this phase. Acceptance criterion 1's "genuine 404" therefore
  holds on content everywhere and on status only for the signed-in-staff
  `/shop` case above; a product page never returns a real 404 status,
  hidden or not.
  **The cart stores product ids and cartons and never a price — measured, not
  assumed.** Three real catalogue products were added as a guest (one from a
  product card, one from a product page's buy box stepped to 2 cartons, one
  from a second card): the header badge read "3 products in your cart", `/cart`
  showed 3 products · 4 cartons, and the three line amounts — RM 210.00,
  RM 420.00, RM 496.80 — summed to the summary and the total exactly,
  RM 1,126.80. `localStorage["lh-shop-cart"]` read verbatim was
  `{"v":1,"lines":[{"productId":"…","cartons":1},{"productId":"…","cartons":2},{"productId":"…","cartons":1}]}`
  — ids and cartons, nothing else, no unit price and no line amount anywhere
  in it. (The stale-price replacement itself — a live RM 210.00 → RM 349.90
  edit in ops reflected on reload with no trace of the old figure — is Task
  11's own measurement, not re-run in this task; nothing in the commits
  since then touches cart pricing.)
  **The merge was proven with a row count, twice.** Signed in as the test
  client with that guest cart still in `localStorage`: the account's `DRAFT`
  `WebOrder` landed at exactly **3** `WebOrderLine` rows (the account had none
  before — its Task 11 leftover was cleared first so the count means what it
  says), and `localStorage["lh-shop-cart"]` was gone (`null`) immediately
  after. A second pass proved the overlap case the first couldn't: signed out,
  added 2 more cartons of a product already in the merged cart as a guest, and
  signed back in — the row count **stayed 3** and that one line's cartons went
  1 → 3 (summed, not duplicated).
  **Facet counts agree with the database, not just with themselves.**
  `/products?category=Shower+cream+%26+gel&brand=Zen+Garden` showed "98
  products · showing 1–24" with a single "Zen Garden" filter chip and the URL
  carrying both params; `prisma.product.groupBy` on the same two filters
  independently returned **98** for that exact pair. An unavailable line
  (`needsReview` flipped true on a cart line, then restored) showed the "No
  longer available" chip, a fully `disabled` stepper — all three controls,
  checked in the accessibility tree, not just dimmed by CSS — a "—" amount,
  the total recomputed excluding it (RM 1,126.80-equivalent state → RM
  916.80 with the line's RM 210.00-per-carton×3 excluded), and *Send order*
  disabled.
  **Both cross-host redirects still hold.** A `MEMBER` signing in at the shop
  host's own `/signin` ended up authenticated on the portal host; a `CLIENT`
  signing in at the portal host's `/signin` ended up redirected to the shop
  host — both read from a real session, not inferred. Ops itself was read,
  not written: signed in as `aisha@lovinghandsportal.com` on the portal host,
  `/`, `/purchase-orders`, `/buyers`, `/products` and one PO detail page
  (`PO-2025-0001`) all answered 200 with real figures — 31 purchase orders ·
  RM 606,143.82 for the dashboard's 30-day window, 406 purchase orders (the
  list's own merged-with-drafts count) · RM 8,161,352.29, 11 buyers, 311
  products (308 real + the 3 fixture rows still live at that point), and the
  PO detail's RM 40,944.62 Delivered total — untouched by this branch, whose
  only shared files are two query modules, the proxy and `env.ts`. The PO
  detail page logged three pre-existing R2/CORS console errors on the seeded
  document's presigned URL ("We couldn't read that PDF" shown on screen) —
  the long-documented seeded-document issue, unrelated to this branch.
  **The catalogue repair from earlier tasks is now the recorded, deliberate
  state, not test data.** Development held zero `Product` rows when this
  phase started — a prior cleanup had taken the whole catalogue with it — so
  an earlier task re-ran `scripts/import-catalog.ts --labels` and a one-off
  controller script gave the 308 real products sample prices by an exact,
  deterministic formula — per-piece = litres in the name × 17.5, or if the
  name gives millilitres instead, millilitres ÷ 1000 × 19, or 6.90 if
  neither is present; price = `max(RM 9.90, round(packSize × per-piece × 10)
  ÷ 10)` — and cleared `needsReview` on all 308. That is left in place on
  purpose: Phases 18–22
  need a sellable catalogue, and the final `Product` count is **308**, all
  priced, `needsReview: false` on every one. The three `SDD-TEST-*` fixture
  products Task 7 added to unblock its own browser check when the table was
  still empty are gone.
  **Zero horizontal overflow across the full sweep**: `/`, `/products`, the
  category+brand filter, a product page and `/cart` with three lines, each at
  390/768/1440 — 15 combinations, `scrollWidth === innerWidth` on every one.
  The 390px smallest-control probe was run on three of the five swept
  routes — `/cart`, `/products` and the product page — returning 21–24
  elements under 44px each time; `/` and the category+brand-filtered
  `/products` were not re-run, on the assumption (not a measurement) that
  the pattern held. Every element in those three lists is the same kind: the
  search input/button and the category nav chips (32px/36px, spec-dictated
  and already reviewed-and-accepted in Task 7), plus plain text links
  (product names, footer rows). Every icon-only touch target — the cart
  trash button, the carton stepper's two buttons — was absent from all three
  lists, i.e. ≥44px on the routes actually measured.
  **One environment wrinkle, not a product defect, recorded because it cost
  real time.** Partway through, Chrome (via the Playwright MCP browser) began
  refusing every connection to `shop.localhost` and, after a server restart,
  even to `localhost` — while `curl` on the same machine reached both
  instantly and Chrome's own `net-internals` DNS lookup resolved
  `shop.localhost` correctly to `127.0.0.1`/`::1`. Clearing the host cache and
  flushing the socket pool did not fix it. The guest sweep, the cart journey
  and the merge proof were completed against the *same running server* reached
  as `foo.localhost` instead, after confirming by `curl` that `foo.localhost`
  and `shop.localhost` behave identically once `SHOP_HOST`/`SHOP_URL` are
  overridden to match (a shell-exported env var, read by `src/proxy.ts`'s own
  `process.env.SHOP_HOST` — no file changed, nothing committed). The canonical
  `shop.localhost` wire statuses in this entry were read by `curl`, unaffected
  by the browser issue. One sub-case was not re-verified here for the same
  reason: a signed-in staff member's `/shop` on the portal host returning a
  pinned 404 (rather than the guest's 307) — that code path is unchanged since
  Task 3 and was exercised in earlier tasks' own browser checks.
  Test data removed: the test client `sdd-client@example.com` deleted along
  with its `DRAFT` `WebOrder` and 3 `WebOrderLine` rows and 5 `LoginAttempt`
  rows; the 3 `SDD-TEST-*` products deleted (0 remaining rows referenced
  them); `Product` count **311 → 308**; `User` count **3 → 2**; `WebOrder`/
  `WebOrderLine` counts **1/3 → 0/0**. Independently re-verified rather than
  trusted: the one product Task 11 repriced sits back at RM 210.00 with
  `needsReview: false`, the one product Task 10 made inactive is `active:
  true` again, and every product in the catalogue reads `needsReview: false`
  (0 of 308). `aisha@lovinghandsportal.com`'s password was reset twice during
  this task's own verification (once to run the member-redirect check, since
  its prior value was unknown) and restored to the documented seed default,
  `Password123!`, at the end. 620/620 tests pass, `tsc`, `lint` and `build`
  all clean. **Not verified:** anything on production; no ops *write* path
  (upload → extract → confirm) — this branch's only shared files are read
  paths, and an upload spends a real Anthropic call; no ops write journey
  (advance/revert stage, edit, confirm) was exercised beyond the read-only
  pages named above, by controller instruction.
- 2026-09-10: Phase 16 — the storefront — built and **driven end to end in the
  browser as both audiences** (`feature/storefront`, spec
  `docs/specs/16-storefront.md`). A client browses, orders by the carton and
  sends it; ops sees it in the same queue an emailed PDF lands in, reviews it
  and confirms; the client watches the stage move. Catalogue, product page,
  cart, my orders, the ops review screen, the work-queue entry and the
  notification email.
  **The cart stores cartons and product ids and never a price**, and this was
  proven rather than asserted: with a cart open, `SCR-BAM-180` was repriced
  189.00 → 225.50 in ops; the stored lines read `unitPrice 0, amount 0`
  throughout; the reloaded cart showed **no trace of 189.00**, the line
  recomputed to RM 676.50 and the total to RM 1,926.50. `submitWebOrder` is the
  only place a price is written, and the snapshot took **225.50** — the figure
  the client actually saw — not the one current when they added it.
  **The silent regression is gone and was measured gone.** Making
  `PurchaseOrder.documentId` nullable turns the inner joins in
  `po-list.sql.ts` into a trap: left alone, every shop order vanishes from the
  purchase-order list, its money summary, the needs-review count and the buyer
  page, with no error and **no type failure** — the generated Prisma client
  types the relation as non-null whatever the schema says, so `tsc` found none
  of the call sites and they were audited by grep. After the fix the confirmed
  order appeared in the list, in `1 purchase order · RM 1,926.50`, labelled
  **WEB**, with "From the shop" where the uploader would be, and on the buyer's
  page. `po-list.sql.test.ts` asserts the generated SQL, because nothing else
  would.
  **Nothing internal reaches the shop, checked against the full HTML** rather
  than visible text: an ops note planted as `INTERNAL-CANARY-DO-NOT-SHOW`,
  `Aisha Rahman` (confirmedBy) and `Chris Lam` (stage `changedBy`) were all
  absent from a confirmed order's page. Another buyer's order id, a product not
  in the shop, and an invented id each returned a **genuine 404**. The
  projections are explicit narrow selects asserted by equality, so a column
  added later has to be a deliberate edit; stage dates are shown because they
  are the client's own facts, but only `STAGE` events — an `EDIT` event carries
  the totals-mismatch note — and `changedByName` is forced null.
  **Two defects the browser found that the build, the types and 574 tests all
  passed over.** The client's order list rendered **60-odd rows in one wall**;
  it now pages at twenty. And editing a quantity on the ops review screen
  changed the line amount while leaving subtotal and total as the buyer's
  originals — **the totals gate could not see it**, because `checkTotals`
  compares subtotal + tax against total and those three still agreed. That
  check is right for a scanned PO, where the document prints all three; a shop
  order has nothing printed to disagree with, so its subtotal is derived from
  the lines. Left alone it would have written a purchase order whose total
  contradicted its own line items. Measured after the fix: 3 cartons → 2 moves
  the line 676.50 → 451.00 and the order total 1,926.50 → 1,701.00.
  A third test passed **vacuously** and was caught: it called
  `deletePurchaseOrder({ poId })` where the schema wants `id`, so the action
  returned early and "not called" was true for the wrong reason.
  `writePurchaseOrder` is now the one writer for both intakes, so a shop order
  gets the same per-line product decisions and the same `ORDER_PLACED` event
  attributed to System; verified on the confirmed row, which carries
  `documentId: null` and the buyer's own `ACME-PO-771`. Open orders per buyer
  are capped at five, because `rate-limit.ts` covers sign-in and password reset
  only. `/api/documents/[id]/url` was deliberately **not** scoped by buyer —
  its ops-wide access is a product decision and Phase 15 already closed the
  client hole; the hazard is recorded in the route instead.
  Test data removed: 1 purchase order, 2 line items, 1 web order, 1 client;
  counts back to 400 / 1606 / 2 users, zero web orders, zero clients. 574
  tests, typecheck, lint and build pass. **Not verified:** anything on
  production — the shop subdomain does not exist yet, and the catalogue is
  unpriced.
- 2026-09-09: Phase 15 — client accounts — built and verified in the browser
  (`feature/client-accounts`, spec `docs/specs/15-client-accounts.md`). A
  buyer's own staff can now sign in on their own host, and the portal has its
  first notion of an account that is not ops staff.
  **The load-bearing change is that `requireUser()` changed meaning** — from
  "signed in" to "signed-in staff". Every Server Action and route handler
  already called it, and every one was written when ops staff were the only
  kind of user, so redefining it once makes all of them client-proof and makes
  code written later fail closed. `changePassword` is the single caller moved
  to `requireAccount`, because a client arrives with `mustChangePassword` set
  and has to be able to clear it.
  **The invariant is in the database, not only in code.** Marking clients by
  `buyerId` alone would fail *open*: `role` defaults to MEMBER, so a client row
  that lost its buyer would silently become an ops member with unscoped access
  to every buyer's orders. A CHECK constraint enforces
  `role <> 'CLIENT' OR buyerId IS NOT NULL`, and it was verified to refuse the
  case rather than assumed to. **Two migrations, not one**: Postgres refuses to
  reference a newly added enum value in the transaction that added it, and the
  CHECK spells `'CLIENT'` — combined they pass `migrate dev` against a database
  that already has the value and fail `migrate deploy` in production.
  **A defect the browser found and the build could not.** A cross-host redirect
  issued from the proxy came back as `location: /` — its origin stripped,
  because both hosts are one deployment — and the browser bounced against the
  same host until it gave up with `ERR_TOO_MANY_REDIRECTS`. The proxy was
  logged building `Location: http://localhost:3000/` while the wire carried
  `/`, so something below it relativises. **A redirect from a layout survives
  intact**, so both cross-host redirects moved there, where they also run
  against a real session rather than a token up to five minutes stale.
  Measured after the fix: an ops member signing in on the shop host is sent to
  the portal; a client signing in on the portal host is sent to the shop;
  `/shop`, `/shop/cart` and `/shop/orders` are each a **genuine 404** on the
  portal host with the status pinned; the full client journey runs sign-in →
  forced `/account/password` → storefront scoped to their own buyer
  ("Acme Industrial Sdn Bhd"); and the session carries `role: CLIENT` with the
  `buyerId`. **The cookie is host-only and that is the property to never trade
  away** — a client's session on the shop host does not exist on the portal
  host at all, so they arrive signed out rather than merely redirected. One
  consequence worth knowing: an ops person bounced off the shop host has to
  sign in again on the portal, which is inherent to that isolation.
  Google is refused for a client with "Use your email and password to sign in."
  — `allowDangerousEmailAccountLinking` is on deliberately, and without that
  branch a client whose invited address happens to be a Google account could
  link it and skip `mustChangePassword` entirely. Clients are also excluded
  from the admin users list, because the drawer's role schema cannot represent
  CLIENT — the free half of this design — and a customer must not be
  promotable to staff from there.
  `/shop` serves a placeholder until Phase 16, so the shop host says something
  truthful the moment this deploys rather than 404ing like a broken invite.
  Test data removed: the invited client deleted, the development member
  reverted to MEMBER; zero CLIENT rows remain. `SHOP_HOST`/`SHOP_URL` added to
  `.env.example`, both optional — unset means one host, which is what makes dev
  and preview deployments work. 510 tests, typecheck, lint and build pass.
  **Not verified:** anything on production — the shop subdomain does not exist
  yet. Adding it is `SETUP-CHECKLIST.md` §6.1, and the Google OAuth step must
  deliberately **not** list it.
- 2026-09-09: Phase 14 — product images — built and verified in the browser
  (`feature/product-images`, spec `docs/specs/14-product-images.md`). The write
  path Phase 08 specced and never built: **`ProductImage` rows were created
  nowhere in application code**, only by the seed, so every real product was a
  text card. `reorderImages` and `deleteImage` already existed; only upload was
  missing.
  **Presign takes the whole batch in one call**, which is not a stylistic echo
  of Phase 03: `ProductImage` has `@@unique([productId, position])` and the hook
  runs three files at once, so presigning per file races on `position` and
  throws P2002. Three images uploaded together landed at positions 0, 1, 2.
  **`sharp().rotate()` was verified rather than asserted.** A test file stored
  800×1400 carrying EXIF orientation 6 produced a **1400×800** derivative —
  without `.rotate()` it stays 800×1400 and renders sideways, because sharp
  drops EXIF on write. `withoutEnlargement` proven the same way: 2400×1600 →
  1600×1067, but 600×600 stayed **600×600** rather than being upscaled into
  blur. `next.config.ts` `SHARP_ROUTES` gained the complete route and the
  emitted `.nft.json` was checked before pushing — 76 sharp files, 14 `@img`
  files — because that failure is production-only and cannot reproduce on macOS.
  **Two defects the browser found that the build could not.** *Make cover*
  **swapped** with position 0 instead of splicing to the front, so making image
  3 the cover silently demoted image 1 to position 3 — reordering a picture the
  reader never touched; adjacent arrows stay a swap, where a swap and a move are
  the same thing. And the four icon buttons per tile compressed to **21px** at
  390px against the 44px minimum the 2026-09-06 mobile pass set; tiles drop to
  two columns below `sm` and the buttons take `size-11`, measured back at
  exactly 44px.
  Rejections verified in a mixed batch: a PDF and a 17.2 MB file were refused by
  name ("That image is 17.2 MB — the limit is 5.0 MB") **while the good file in
  the same batch still uploaded**. Deleting removed the row and **both** R2
  objects, leaving no orphan. Zero page overflow at 390 / 768 / 1440px, with the
  gallery column at 457px against the details card's 639px — the 5fr:7fr split
  holding, no aspect-ratio blowout.
  `scripts/import-product-images.ts` reads a folder named by SKU, and the
  ordinal rule was checked against the real catalogue: `LHANDS-DW-1000-LE-2.jpg`
  matched the product whose SKU *is* that, not image 2 of `…-LE`. Unmatched
  files are reported, never fuzzy-matched. A real run wrote 4 images across 3
  products. **Reordering is arrow buttons plus Make cover, not drag** —
  `@dnd-kit` is in the master spec's dependency table and not in
  `package.json`, and buttons need no keyboard alternative.
  Test data removed: 7 images and all their R2 objects, `productImage` count
  back to the seed's 19; the development member was promoted to super admin to
  reach the manager and **reverted to MEMBER** afterwards. 482 tests, typecheck,
  lint and build pass.
  **Deploying found a real defect, and the local check that was supposed to
  catch it was worthless.** The spec said to verify the emitted `.nft.json`
  before pushing; that was done — 76 sharp files — and production still 500ed
  with the same `ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.6`. A macOS build
  traces sharp *anyway*, because Next only strips `@img/sharp-libvips*` when
  `hasNextSupport` is true, so the local artefact looks identical whether or not
  the include matched. **`outputFileTracingIncludes` keys are globs**, and
  `[id]` is a character class matching one `i` or `d`, so
  `/api/products/[id]/images/complete` never matched the real page;
  `/api/avatars` has no brackets, which is why `/settings` kept working and hid
  the pattern. The key is now `/api/products/**`.
  **The probe that found it needs no super admin and touches no data**: sharp
  dlopens at module load, before `requireSuperAdmin()` runs, so an authenticated
  POST from any member distinguishes them — 500 with Next's HTML error page
  means the module failed to load, 401 with our own JSON means it loaded. Both
  routes now answer `401 {"error":"This action needs super admin access."}` on
  `www.lovinghandsportal.com`. Worth reusing for any future sharp route.
  One deploy in between failed on Prisma `P1002`, a transient Neon timeout
  during `migrate deploy`, and succeeded on a plain redeploy — unrelated to the
  code. **Still unverified:** a full end-to-end upload on production, which
  needs a super admin, and the only one is Google-only.
- 2026-09-09: Phase 12 — product matching at review — built and verified in the
  browser (`feature/product-matching`, spec `docs/specs/12-product-matching.md`).
  Every line of a PO now carries an explicit human decision — a catalogue
  product, *create a new one*, or *not a product* — and Confirm is locked until
  all of them are made, phrased like the totals gate beside it and mirrored by a
  server check so calling the action directly cannot bypass it.
  **The defect this fixes is that `confirmPurchaseOrder` re-ran `resolveProducts`
  and overwrote `productId` from the printed code**, so a human correction had
  nowhere to survive. Proven in the browser rather than argued: a line printing
  `ZEN-SC-1000-GM-VN` with the **Iraq** product chosen by hand confirmed as the
  Iraq product. Under the old code it would have been overwritten with Vietnam.
  Scoring is one pure module, `src/lib/extraction/match-products.ts`, with no
  Prisma import and no I/O, so it is unit-tested against the codes production
  actually holds — 24 tests. Exact code 100, code ignoring separators 96, exact
  name 92; otherwise token overlap weighted by **inverse document frequency**,
  because four of six words in a typical line are shared by two hundred
  products, clamped to 90 so a similarity score can never impersonate the exact
  rule. **A size disagreement caps the score at 40 however much wording agrees**
  — 2.1L and 500ML share every word they have. Tokenising is deliberately *not*
  `sku.ts`'s: a period separates rather than deletes (or `ZENSC-R.JELLY2LT`
  loses `jelly`) and a letter/digit boundary splits.
  **Market is shown on every candidate and never scored.** Documents rarely
  print it, so scoring it is noise — but the development catalogue holds **8
  products named `ZEN 1L — Goat's Milk`** differing only by market, and the
  picker told them apart in one list (`… · Arab · 12/carton`, `… · India · …`)
  without opening another screen.
  **This reverses a Phase 11 decision on purpose.** `resolveProducts` split into
  `suggestProducts` (reads, writes nothing) and `createProductsForLines` (writes
  inside `confirmPurchaseOrder`'s transaction), so **a discarded draft leaves no
  products behind** — the cost Phase 11 recorded and named the fix for. Measured:
  a line marked *Create new product from this line* carrying
  `TOTALLY-UNKNOWN-CODE-XYZ`, then discarded, left the catalogue at 320 products
  and created zero.
  **Two things the plan got wrong that the code caught.** It specified
  `text-accent-amber` for the match hint — **there is no such token**; it would
  have compiled to no colour at all and inherited the surrounding ink. The hint
  uses `brand-amber`, the amber `Field` already uses for a low-confidence
  extraction. And it predicted `src/actions/confirm.test.ts` would fail once
  `resolveProducts` was deleted; **it kept passing**, because both test files
  mock the module by name and the mock supplied the missing export. `tsc` was
  the only thing that caught the break, which is why tasks 3+4 and 6+7 were each
  committed together rather than leaving a commit that did not build.
  Verified at 390 / 768 / 1440px: **zero page overflow at all three**, with the
  line-items table scrolling inside its own container at exactly 952px — the new
  `--spacing-line-items`, widened from 840px in the same commit as the first
  column going `w-44` → `w-72`, since under `table-fixed` the `<col>` widths are
  authoritative and the token is what the scroller measures. `Combobox` gained
  `pinned` rows so *Create new product* and *Not a product* stay reachable when
  the query matches nothing, which is exactly when they are the answer —
  confirmed by typing `zzzznothingmatches` and seeing only those two rows.
  All test data removed: 1 purchase order, 4 line items, 1 stage event, and both
  extractions restored to `draftJson NULL` / `SUCCEEDED`. Counts returned to 320
  products, 400 purchase orders, 1606 line items; no R2 objects were created.
  467 tests, typecheck, lint and build pass. **Known, not verified:** the
  document preview still 404s on every seeded document, which is expected data
  rather than a defect — the seed writes `r2Key` values it never uploads.
- 2026-09-09: Two defects found by yesterday's production audit, fixed and
  merged (`fix/sku-shape-and-duplicate-check`). **A product could exist that
  its own edit form refused to save.** `resolveProducts` writes a line's
  printed code straight to the database while `skuSchema` demanded
  `^[A-Z0-9-]+$`, so the products created from real orders —
  `ZEN/SC/2100/CARROT`, `ZENSC-R.JELLY2LT`, `KE218441 68216` (a space) — were
  all unsaveable from the drawer. The schema was a guess about the domain that
  the documents disproved; it now accepts `A-Z 0-9` plus `- . _ / +` and
  spaces, keeps the discipline that mattered by upper-casing and collapsing
  whitespace, and `normaliseSku` is applied in `resolveProducts` too — on
  lookup as well as on create, or the two would diverge. A code carrying
  anything outside that set still needs editing by hand; that is rarer than the
  slashes and spaces that were actually breaking.
  **The duplicate check missed the duplicate it was there to catch.**
  `checkDuplicate` keyed on `buyerId + poNumber`, so when the same document was
  confirmed twice sixteen minutes apart — the second time against a buyer typed
  `STAR VALUE SDN BHD` rather than the `STAR VALUE SDN BHD @ SVPP` created the
  first time — nothing matched and both orders went live. It now falls back to
  the number under any buyer and reports whose. Only the same-buyer case still
  blocks Confirm, because two customers can genuinely share a numbering scheme;
  a different buyer gets a warning naming them and no "this is a revised PO"
  checkbox, since a revision across two buyers would point `revisionOfId` at
  another customer's order. `checkDuplicate` had no test at all, which is how
  this survived — it has four now.
  **A correction to yesterday's report:** `PO-00068` is *not* a duplicate. It is
  revision 1 superseded by revision 2, which is the revision mechanism working;
  the list only ever showed the newer one. Only `SVPPPO26090009` is genuinely
  doubled — same total, same single line (2,112 × Everfresh B Shampoo), the
  same PDF uploaded twice as two `Document` rows, no stage moves on either.
  Deleting one is still pending: which buyer name is correct is the customer's
  own convention, not something to infer. 442 tests, typecheck, lint and build
  pass.
- 2026-09-09: The real catalog is on **production** — 309 products — and the
  landscaping demo data is gone. **The audit is the part worth remembering:
  production was not the demo database everyone assumed.** Before deleting
  anything, a read-only pass found the ops team had been using it: 5 confirmed
  purchase orders (Triways `PO-00068` RM 9,912, Star Value `SVPPPO26090009`
  RM 12,777.60, a 2019 `US-001` test), 8 products auto-created from those
  orders, 17 uploaded documents and **2 drafts still waiting in the review
  queue**. The plan as approved the day before — `--replace-demo`, which
  matched demo rows by SKU prefix — would have run against live business data.
  Two changes made it safe. `replaceDemo` now identifies seeded rows by their
  **id prefix** (`prisma/seed.ts` mints `prd…`/`po…`/`doc…`; everything the app
  creates is a cuid), which a person cannot accidentally reproduce the way they
  could type a SKU, and it **refuses outright** if any non-seeded purchase order
  turns out to reference a seeded product. The dry run then reported exactly
  12 products and 400 orders, leaving the 5 real ones, and did not refuse.
  **The second finding changed what the catalog should be.** Those 8 real
  products carry the codes the customers print — `ZEN/SC/2100/CARROT`,
  `ZENHW-LAV500ML` — while the import generates `ZEN-SC-2100-CR`,
  `ZEN-HW-0500-LV`. The same products under two codes, and only the customer's
  code can ever match an incoming document, since that is what
  `resolveProducts` compares. Importing blind would have left 8 pairs in which
  the *empty* row looked official and the *real* row did the work. `--merge`
  takes an explicit `{existing SKU: imported SKU}` map — 7 pairs, written by
  hand and reviewed, never fuzzy-matched — and enriches the existing row with
  brand, variant, pack size, market and category while keeping its code, its
  name as printed on the document, its price and its order lines. The eighth,
  `EVERFRESH B SHAMPOO LVD& CHAMOMILE 2.1L`, has no equivalent in the sheet
  (the sheet's Everfresh lines are all shower cream) and was left alone.
  Sequence: pushed 8 commits, Vercel deployed in 2m and `prisma migrate deploy`
  applied `product_country`, `product_market` and `product_brand_variant_pack`;
  columns confirmed present *before* any data was touched. Result verified on
  production: 309 products, **0 generated twins**, 0 landscaping rows, the 5
  real orders and 17 documents intact, 19 line items, and the merged rows
  holding their real prices (RM 6.60, RM 2.90) rather than 0.00. The site
  answers 200 and redirects unauthenticated traffic to `/signin`. Production
  credentials were pulled to the scratchpad and deleted after each use.
  **Three things found and not acted on.** Production holds apparent duplicate
  orders — `PO-00068` twice for the same buyer and total, and
  `SVPPPO26090009` twice under buyers `STAR VALUE SDN BHD` and `STAR VALUE
  SDN BHD @ SVPP`; the duplicate check keys on buyer, so a buyer entered two
  ways defeats it. **A product auto-created from a purchase order can carry a
  SKU the edit form rejects**: `resolveProducts` writes `line.sku` straight to
  the database while `productSchema` demands `^[A-Z0-9-]+$`, so
  `ZEN/SC/2100/CARROT` cannot be saved from the drawer until its code is
  changed. And `APP_URL` is unset in production, so `src/lib/env.ts` falls back
  to `VERCEL_URL` — the app boots, but password-reset and invite emails link to
  the per-deployment URL rather than `www.lovinghandsportal.com`.
- 2026-09-09: The customer's real catalog is in the development database — 308
  products extracted from **the PDF**, not a workbook. `ZEN GARDEN DC INVENTORY
  2026` arrived as a one-page Google Sheets print: a ~300-row, ~800-column
  sheet squeezed onto one A4 page at **sub-1pt text**, which is why a plain
  text extraction interleaves the columns into nonsense. **The cell borders are
  what made it readable.** Sheets draws every border as a vector line and omits
  the internal borders of a merged cell, so the horizontal borders inside one
  column's x-range mark exactly where that column's merged cells begin and end,
  and a merged cell's text sits at the vertical centre of its range — enough to
  rebuild brand, line and variant with each merged value spread across the rows
  it covers. 360 row bands, 336 label rows, 89 lines, 18 brands, 9 export
  markets. Verified against the screenshot the user sent: `ZEN GARDEN |
  VIETNAM ZEN 2.1L (6) | GOAT'S MILK…` came back exactly, and
  `ZEN-SC-2100-GM-VN` is the SKU it produced. `scripts/pdf-to-labels.py` is
  that extractor, and re-running it reproduces
  `docs/imports/zen-garden-dc-inventory-2026.labels.json` byte-for-byte;
  `import-catalog.ts --labels` parses it with the *same* code an .xlsx goes
  through, so the PDF path adds no second parser.
  **The dry run earned its place — it found six defects before anything was
  written.** Three in the parser: `LOTUS 'S 2.1L` produced a line called `'S`;
  `(52CTNS/P)` left an empty `()` in names; and duplicates were dropped in
  **silence**, which was hiding the next two. Then, once reported: 9 real
  products were being lost because the agreed SKU shape has no pack segment and
  the sheet sells the same line in two carton sizes (MR.KING 1.5L by 12 and by
  6, the roll-on by 72 and by 12, olive oil big-carton and inner). A clash now
  takes `-X{pack}` **only when the pack is what differs** — a test caught the
  first attempt giving two twelves `-X12` each, asserting a distinction the
  packs do not make — and falls back to a counter for `1L DWASH PUMP` vs `CAP`,
  which are both twelves. Sixth: the sheet's own two misspellings,
  `PHILLIPPINES` and `PHILLIPINES`, were becoming two markets in a picker whose
  whole point is that a list cannot fragment; `AA PHARMACY` and `L'EVINIA` also
  title-cased to `Aa Pharmacy` and `L'evinia`. Accounting is now exact:
  336 rows − 28 = 308 products, nothing lost.
  **28 rows in 5 blocks were deliberately not imported**, because the sheet
  nests a second table inside the variant column and a brand/line/variant model
  cannot represent it: ZEN GARDEN HAIR GEL (12 rows, colours × sizes × packs),
  ZEN HAND SANITIZER (8, sizes), THERAPY LEVEL HAND SANITIZER (3, sizes),
  FRIENDS 300ML ALOE (2, the line name split across two columns) and KIMIA
  SUCHI 240ML (3 — bottles, inserts and caps, which are packaging rather than
  goods). The importer prints them so a person can enter them.
  Every product landed with `listPrice` 0.00 and `needsReview: true`, so the
  *Needs review* chip is the pricing worklist — verified in the browser reading
  308, beside a brand filter with 18 entries and cards reading
  `L.Hands · Lemon / LHANDS-DW-1000-LE-2 · 12 per carton`. Column A is stored
  as the brand verbatim, including the values that are really customers
  (Econsave, Hero Market, AA Pharmacy) — the sheet's own grouping, editable in
  the portal, and nothing invented. **Development only**; production is
  untouched.
- 2026-09-09: Catalog model built, verified in the browser and merged (`feature/catalog-model`) —
  `brand`, `variant` and `packSize` on Product, the nine personal-care
  categories replacing the landscaping list, `src/lib/sku.ts` generating
  `{BRAND}-{TYPE}-{SIZE}-{VARIANT}-{MARKET}`, `src/lib/catalog-import.ts`
  reading the customer's sheet, `scripts/import-catalog.ts` loading it, and
  the seed rewritten to a ZEN-shaped catalog. **The SKU proposes itself** on
  the create page from brand, category, the size in the name, variant and
  market, until the reader types one: watched live going `SC-2100-MY` →
  `ZEN-SC-2100-MY` → `ZEN-SC-2100-GM-MY` → `ZEN-SC-2100-GM-VN` as each picker
  was filled, then landing on the detail page with all nine `dl` rows matching
  what was entered. Brand, variant and market share one `GrowingListPicker`
  (the day-old `MarketPicker`, generalised); search matches all three, so
  `?q=vietnam` finds the product; the brand filter appears only once two brands
  exist. **The sheet parser is tested on the screenshot's own shape**: a
  worksheet with ZEN GARDEN merged over two lines in A, `VIETNAM ZEN 2.1L (6)`
  merged over five variants in B, one variant per row in C — every merged cell
  filled down from its anchor, the market prefix split off whether it is a
  country or a customer (MYDIN, HERO MARKET), `(6)` and `(48PCS/CTN)` both read
  as pack counts, pallet notes and `[19]` footnotes dropped. The column
  positions are an assumption until the XLSX arrives; `--columns` overrides
  them and `--dry-run` prints the table before anything is written. **One
  layout defect the build could not catch, and it was already latent
  yesterday**: `aspect-4/3` on a grid child that *stretches* to the row takes
  its width from the stretched height, so once the details card grew to eleven
  fields the empty gallery panel came out 1470px wide and pushed the card off
  the screen (measured 130px of card at 1440px). `self-start` on the panel —
  and on `ProductGallery`'s empty state, which has the same shape — fixed it:
  446px / 625px, no overflow. **Two Prisma commands hung** during the build,
  once for 5 minutes: the machine slept mid-command (the clock jumped 19:23 →
  21:05) and `migrate dev --create-only` also prompts in a way a non-TTY
  cannot answer, so the three-column migration was written by hand and
  applied with `migrate deploy` under a `timeout`. An unpriced import lands at
  `0.00` and the detail page now says "No list price set yet" rather than
  "0.0% above list". Test data removed (the product and its price row), the
  seed member reverted to MEMBER, no brand/variant/market values left in the
  development database. 429 tests, typecheck, lint and build pass.
- 2026-09-08: Product creation moved to its own page and products gained a
  market (built as "country of origin", renamed `market` the same day once the
  customer's inventory sheet showed the values are destinations and customers —
  see Notes), built, verified in the browser and merged
  (`feature/product-create-page`). **`/products/new` is shaped like
  `/products/[id]`** — same back link, breadcrumb, eyebrow and
  `lg:grid-cols-[5fr_7fr]` band — so the screen you fill in is the screen you
  read afterwards; the name is the title field and the list price the display
  figure, and the eyebrow fills in live (`STN-BAS-060 · Stone · per slab` while
  typing). None of the analytics are mirrored: a product that does not exist
  has no history, and six em-dash tiles over an empty chart would be furniture.
  `+ New product` is a real `<a href>` styled as the ink pill rather than a
  drawer trigger, so cmd-click opens a browser tab for free without the stale
  catalog a forced `target="_blank"` would leave behind. **`ProductSheet`
  became edit-only**, losing `BLANK` and the three `product ? … : …` branches
  in its title, description and button; `product` is now required, which is
  what made TypeScript find every construction of `ProductInput` when the
  country key was added. **The country list is not hardcoded.** The user asked
  for a fixed short list and then that it "be input by super admin users", and
  the two reconcile as a `Combobox` whose options are `listCountries()` — every
  country already on a product — plus the `+ Add "…"` row it already renders,
  so the list is built by using it. `PRODUCT_CATEGORIES` stays fixed for the
  opposite reason: share charts group by category, and a fragmented list makes
  them quietly wrong, while a country is a label on one product. Nullable and
  never optional, trimmed to null, `max(56)`; the twelve existing products show
  `—` and nothing was backfilled. **Verification needed a super admin and the
  only one is Google-only**, so the seeded member was promoted on the
  development branch (`ep-mute-frog`) and reverted afterwards — the first
  attempt was blocked by the permission classifier and the user approved it
  explicitly. Verified live: created a product with a typed-in country, landed
  on its detail page with the eyebrow, title, `RM 128.00` and
  `Country Indonesia` all matching what was entered; the next create then
  offered Indonesia, and typing `indonesia` lower-case offered the existing
  entry with **no `+ Add` row**, so the list cannot fork on casing; "No country"
  cleared it back to `—`; an empty form toasted "A name is required" and a
  reused SKU "That SKU is already in use.", both keeping the typed values.
  **Two defects the build could not catch, both at 390px**: the name input was
  squeezed to 180px because the Create button shared its flex row (the header
  now stacks below `sm`, 180px → 350px), and the `aspect-4/3` gallery
  placeholder filled the screen so every field sat below the fold (`h-32` below
  `sm`, first field now at y=547 of an 844px viewport). A hydration mismatch
  seen during this pass was a stale dev-server bundle, not a defect — a restart
  cleared it, and the console is empty on a fresh load. **Deviation from the
  canvas:** there is no `/products/new` artboard, so this layout is derived
  from the product detail one; `CLAUDE.md` makes the canvas the source of truth
  and it is behind the code until someone draws it. Test data removed: the
  product and its price row deleted, no country values left in the database,
  the member's role reverted. 406 tests, typecheck, lint and build pass.
- 2026-09-08: Super admin access confirmed on both databases and
  `scripts/grant-super-admin.ts` added. Asked for as "make
  jobhunters.ai.pro@gmail.com super admin on production and development" —
  **it already was on both**, checked before anything was written and then
  written anyway so the state is explicit rather than assumed. The two
  databases are genuinely separate branches: development is `ep-mute-frog…`,
  the block appended at the bottom of `.env.local` — the pair above it labelled
  "development branch", `ep-red-hat…`, still rejects its password after the
  2026-09-06 endpoint move, and both Next and node's `--env-file` take the last
  duplicate key, which is why the app works at all — while production is
  `ep-polished-wildflower…`, read from `vercel env pull --environment=production`
  and deleted again afterwards. Each row carries `emailVerified` and no
  password, which is exactly what lets `allowDangerousEmailAccountLinking`
  attach the Google account on first sign-in; neither database had an `Account`
  row yet. **`SEED_SUPER_ADMIN_EMAIL` had drifted to
  `superadmin@lovinghandsportal.com`** — an address that can sign in by neither
  route — so a `--reset` reseed would have truncated the real super admin and
  replaced them with an unusable one; `.env.local` now names the Gmail address,
  with `SEED_SUPER_ADMIN_NAME` holding the display name the row already
  carries. The localhost callback is registered on the OAuth client — the
  button reaches Google's account chooser with no `redirect_uri_mismatch` — and
  production shares the same client id. **Unverified:** the production callback
  URI, because the browser held a signed-in production session and checking
  meant either ending it or authenticating as the user. **Noticed, not acted
  on:** production holds 405 purchase orders, the demo seed
  `docs/specs/SETUP-CHECKLIST.md` §1 forbids there, and `APP_URL` is absent
  from the pulled production environment although `src/lib/env.ts` requires it.
- 2026-09-08: A picture change now reaches every open tab, merged
  (`fix/avatar-across-tabs`) and verified on production. Reported from the
  Activity card — the sidebar showed the new picture while the Activity rows
  still showed initials. **The data path was never wrong**: every screen reads
  `User.image` on the server, and a fresh load of the very purchase order in
  the report showed all four of that person's Activity rows carrying the new
  picture (checked on production before changing anything). What is wrong is a
  page rendered *before* the change that never re-renders, and two tabs
  reproduce it exactly: change the picture in one and the other keeps the old
  sidebar, table avatars and Activity rows indefinitely, because
  `router.refresh()` only ever reaches the tab it runs in. A `BroadcastChannel`
  closes it — the picker posts once the save has settled, and
  `AvatarChangeListener`, mounted once in the portal layout, refreshes every
  other tab, dropping its client router cache with it. A channel never delivers
  to the context that posted, so the saving tab is not refreshed twice.
  Verified with a watcher installed in the second tab *before* the change, on
  production: all four Activity rows and the sidebar moved to the new picture
  with no navigation, no reload and no click in that tab. Test pictures removed
  from production and locally afterwards.
- 2026-09-08: The shell picture waits too, and the toast waits for it, merged
  (`feature/avatar-saving-everywhere`) and verified on production. Two reports,
  one cause: the picture in the sidebar and the mobile top bar is the same
  picture `/settings` changes, but it lives in the portal **layout** — a
  different subtree, re-rendered on the server — so it sat unchanged and
  unmarked for the whole save, and "Picture updated" fired the moment the
  action returned, before the session cookie was rewritten, before the shell
  re-rendered and before the browser had even fetched the new file. A success
  message that is briefly untrue. `AvatarSavingProvider` carries one flag from
  the picker to `UserMenu` — it sits in the layout because that is the only
  tree holding both — so the shell picture takes the same scrim and ring as the
  preview. The order is now write → fetch the new picture (`preloadPicture`,
  resolving on error too rather than holding a spinner open) → rewrite the
  session cookie → await the refresh → stop the spinners → toast.
  `useAwaitableRefresh` is what makes the last step waitable at all:
  `router.refresh()` returns `undefined`, so wrapping it in a transition is the
  only way to know the server-rendered shell has caught up; it gives up after
  8 s rather than stranding a spinner, the same failure class as the unguarded
  action promise. Measured locally at 1150 ms for the shell picture and 1250 ms
  for the toast; on production all three spinners showed and the picture and
  the toast landed in the same 50 ms sample after a 4.8 s cold start. **A
  verification trap worth remembering:** the first production run appeared to
  fail — no shell spinner, toast 3.7 s before the picture — because the
  deployment had not finished and the old `UserMenu` was still being served.
  The marker that settled it is the wrapper element's exact class, not a
  deployment id, which changes on an intermediate build. Test pictures removed
  from production and locally afterwards.
- 2026-09-08: A saving spinner on the picture itself, merged
  (`feature/avatar-saving-spinner`) and verified on production. The clicked
  tile already carried the 14px ring, but it is a small mark on a 64px
  thumbnail and the thing being watched is the 96px picture above it, which sat
  unchanged for the whole save — 3.2 s on a cold serverless start. The preview
  now takes a scrim and a 28px ring while any picture change is in flight
  (choose, upload or remove), with an `aria-live` "Saving your picture" line
  for anyone who cannot see it; `Spinner` grew one size rather than a second
  spinner being invented, and every existing caller keeps the 14px default.
  Photographed locally with a 4 s delay patched into `fetch`, then confirmed
  live: both spinners, eleven tiles dimmed, "Picture updated" after 3.4 s. Test
  pictures removed from production and from the local database afterwards.
- 2026-09-08: **Avatars had never worked in production** — fixed and merged
  (`fix/sharp-libvips-tracing`), verified live on `www.lovinghandsportal.com`.
  Reported as "clicking an avatar shows *We couldn't reach the server*"; the
  toast was telling the truth, and the same failure had been silent before that
  morning's feedback fix. Probing production separated the paths: the
  `/settings` page (renders 48 DiceBear previews server-side), `/api/upload/presign`
  and `/api/avatars/[userId]` all answered normally, while **choosing an avatar
  and uploading a photo — the only two paths that import `src/lib/avatar-store.ts`
  — both returned Next's own 500 page**, before `setGeneratedAvatar`'s own
  try/catch could run, and wrote nothing. The same production build ran fine
  locally under `npm start`, which pointed at the runtime rather than the code.
  The Vercel log named it exactly: `Could not load the "sharp" module using the
  linux-x64 runtime — ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.6: cannot open
  shared object file`. **Not a missing dependency.** `@img/sharp-linux-x64` was
  in the bundle — sharp got far enough to raise its own loader error — but the
  libvips package it dlopens was not, because **Next's build trace drops it on
  purpose when the build runs on Vercel**: `collect-build-traces.ts` adds
  `**/@img/sharp-libvips*/**/*` to `serverIgnores` whenever `hasNextSupport` is
  true, dating from when the platform supplied sharp for image optimization.
  That is why no amount of local testing could reproduce it — a macOS build
  traces the darwin packages, which are not ignored.
  `outputFileTracingIncludes` in `next.config.ts` re-adds `sharp` and `@img/**`
  for the two entry points that reach them, checked against the emitted
  `.nft.json` files before pushing. Verified on production after the deploy:
  a clay avatar saved in 3.2 s with the spinner showing, toasted "Picture
  updated", replaced the picture and the top bar, and survived a reload; an
  upload returned 200. Both test pictures were removed afterwards, so the
  account is back to initials with no stray R2 object.
- 2026-09-08: Avatar choice feedback fixed and merged (`fix/avatar-choice-feedback`)
  — reported as "let the user choose an avatar; the chosen one should replace the
  Avatar", with a screenshot showing a style chip selected and the initials
  unchanged. **Choosing always worked** — reproduced end to end on voxel-bot and
  clay — but it takes ~550 ms and drew nothing while it did, so a click looked
  inert. **The real defect was the failure path**: `run()` awaited the server
  action with no try/catch, so a *thrown* action (server unreachable, deploy
  mid-flight, session gone) rejected the promise, `setBusy(null)` never ran, and
  **all twelve tiles stayed permanently disabled with no message** — the picker
  was dead until a reload. Reproduced by stopping the dev server mid-click:
  12 of 12 disabled, zero toasts; after the fix, "We couldn't reach the server.
  Try again." inside 100 ms and every tile live. The upload `fetch` carried the
  same trap and the same fix. Feedback reuses the click-feedback pass's
  vocabulary rather than inventing one — the clicked tile takes the ring
  `Spinner` over a canvas scrim, the other eleven drop to 60%, the group takes
  `aria-busy`, and success toasts "Picture updated" as an upload already did. The
  tiles were also the only control on the screen that never said what clicking
  them did, hence the "Pick one to use it as your picture" caption and a
  "Use this avatar" label on each.
- 2026-09-08: Settings avatar gallery and page trim — built, verified in the
  browser and merged (`feature/avatar-gallery`); spec
  `docs/specs/10-settings-and-avatars.md` updated to match. **The gallery is a
  fixed set now.** Phase 10 seeded six previews from the user's own display name
  and offered Shuffle, which rewrote `?seeds=` with fresh `randomUUID()`s on a
  server round trip — a lottery, not a choice, since the face you liked two rolls
  ago was unrecoverable. The seeds are `option-1` … `option-12`, the same twelve
  for every person on every visit, so `searchParams` left the page entirely and
  `useUrlNavigation` left the picker; clicking still saves immediately.
  **croodles was dropped rather than merely losing its credit line**: it is CC BY
  4.0 and that line *was* its attribution, so keeping the style without it would
  have left the licence condition unmet. The other four styles are CC0, which is
  why `attribution` is gone from `StyleEntry` as well — an empty hook invites
  someone to re-add a CC BY style without noticing what it obliges, and the spec
  now says any style added later must be CC0 or bring its line back. **The
  Sessions row, its dialog and the `next-auth/react` `signOut` import left
  `SecurityCard`**, leaving Password as the card's only row; `signOutEverywhere`
  stays in `src/actions/profile.ts`, tested and unreachable, because
  `sessionVersion` is still what disabling a user and setting their password
  bump. **A user who picked an avatar before today keeps the picture** — their
  `avatarSeed` is name-derived, so it is not one of the twelve and no tile is
  ringed until they choose again. Verified against the live database at 1440px
  and 390px: four chips, twelve tiles, no Shuffle, no credit line, no Sessions
  row; clay option 5 saved on click, repainted the preview and the sidebar
  without a reload and was still ringed after one; zero requests to
  `api.dicebear.com`; no horizontal overflow at 390px, where the tiles wrap to
  three rows of four at 64px. Remove put the initials back and `clearAvatar`
  deleted the R2 object, so no test data was left behind. 398 tests, typecheck,
  lint and build pass.
- 2026-09-07: Phase 11 — purchase order revamp — built, verified and merged
  (`feature/po-revamp`, spec `docs/specs/11-po-revamp.md`), with the product-code
  and upload-delete follow-ons merged after it. Six changes: super admin delete,
  delivery date and buyer reference removed, a zoomable original document, a
  visible remark, product codes that build the catalogue, and a line-items table
  that stops clipping itself. **Product codes now build the catalogue** — exact
  code matching, case-insensitive and never fuzzy, but an unknown code now
  *creates* a product rather than leaving the line unmatched; **description
  matching is deliberately gone**, because two active products can share a name
  and the old fallback would attach a line to the wrong product *and* skip
  creating the right one. Cost stays bounded per document (one read, at most one
  write, at most one re-read), and `createManyAndReturn` rather than `createMany`
  because the new ids link the lines. **The known cost, stated:** products are
  created at extraction time, so **a discarded draft leaves its products
  behind** — the user chose this over creating them at confirm, and
  `needsReview` is what makes the junk visible rather than silent; moving
  creation into `confirmPurchaseOrder`'s transaction is the fix if it proves
  noisy. **Deleting keeps the document**: line items and stage events cascade,
  the `Document` and its R2 object stay, and the `Extraction` goes back to
  `SUCCEEDED` so the upload returns to the review queue. The dialog's revision
  warning turned out to be the reverse of the plan's assumption — a superseded
  order redirects to its newer revision, so the real consequence is that deleting
  a revision brings the order it superseded back into view. `needs-review` joined
  `AttentionFlag` rather than becoming a parallel mechanism, inheriting the chip,
  the filter and the count. **Three things the browser found that the build did
  not**: `products/page.tsx` had its own `FILTERS` allow-list beside the type
  union, so the new chip changed the URL and the page ignored it; the line-items
  table pushed the *page* sideways at 390px because the flex column and the
  section between it and the grid both defaulted to `min-width: auto` (`min-w-0`
  on both); and the table had no scroll affordance, so it now uses the same
  `useEdgeFades` hook as `DataTable`, with "+ Add line" moved outside the
  scroller. Measured: description input 88px → 228px, header collisions 2 → 0,
  page overflow at 390px → none, and zoom 100% → 200% moving the image
  514px → 1028px inside the card. **Delivery date and buyer reference** are gone
  from every screen, from the extraction schema and from the prompt; the Prisma
  columns stay, so the data on 400 existing orders survives and the decision is
  reversible. **Not verified in a browser:** the PDF zoom path — every seeded
  document returns `NoSuchKey`, so the only document that loads is a freshly
  uploaded one, and the one used for this test was an image, which exercises the
  `<img>` branch. All test data was removed afterwards: 400 purchase orders, 406
  documents, 12 products, roles reverted, no stray R2 objects.
- 2026-09-07: Phase 10 — account settings and person avatars — built, verified and merged
  (`feature/settings-and-avatars`), then **deployed to production** (Vercel Ready, 1m
  build, so `prisma migrate deploy` applied its migrations to the production Neon
  branch). `/settings` with a Profile card (picture, display name, read-only
  email/role/member-since) and a Security card (password with its last-changed date,
  sign out on all devices), reached from the account menu, never a nav row. Pictures
  come from three sources — an uploaded photo, a generated DiceBear avatar in one of
  five styles, or initials — all converging on one 256×256 WebP in R2 behind a stable
  `?v={hash}` URL, which is what makes the `immutable` cache header safe. One
  `PersonChip` now covers every place the portal names a person; the Activity card,
  "Confirmed by" and "Moved here by" gained avatars and `initials` went from four
  copies to one. **DiceBear renders locally and never over HTTP** — verified in the
  browser, zero requests to `api.dicebear.com`; three of the five styles (`gaze`,
  `voxel-bot`, `clay`) are absent from the API's own `/10.x` index while shipping fine
  in npm. Two library facts found by running it: option names are
  `` `${component}Variant` `` (passing `{ shape: [...] }` throws), and a raw definition
  passed to `Avatar` is deprecated in 10.7.0, so each is wrapped in `new Style(...)`
  once at module scope. **Four defects the build could not catch**: `useSession` had no
  `SessionProvider` anywhere in the app; the sidebar read name and image from the JWT,
  which only re-reads the database every five minutes, so every table showed the new
  avatar while the shell showed the old one (the layout now reads the row); **~1 MB of
  DiceBear was being shipped to the browser** because a client component imported the
  id list from `avatar-styles`, fixed by splitting `avatar-style-ids.ts`; and the style
  chips were 39px on a phone. **`googleImage` was added and then removed at the user's
  request**, taking "Use my Google photo" with it — it cannot work without somewhere to
  keep the Google URL, and a button that always fails is worse than none. `image` is
  still deliberately not written on a Google sign-in for an existing user, which is
  what lets an uploaded avatar survive. Known: `croodles` and `notionists` are close to
  illegible at the 24px the PO table uses — measured before building and accepted.
- 2026-09-07: Product matching built, verified and merged (`feature/product-matching`) —
  prompted by a reported upload failure that **did not reproduce**. "The upload was
  interrupted — check your connection" comes from exactly one place, `xhr.onerror` on
  the browser's PUT to R2, which fires only for a network-level failure with no HTTP
  status; a refused upload would have said "Storage refused the file (403)". Four
  uploads from a clean browser all succeeded, presign → PUT → complete all 200, so it
  was most likely an extension or a transient blip in the reporter's own browser.
  **The intake loop was proven end to end for the first time**: a realistic PO —
  Pacific Timber Sdn Bhd, three catalogue SKUs, RM 13,100.00 — was rendered, uploaded,
  read, reviewed, confirmed and rolled back, with every field correct and the totals
  gate agreeing, and **the document preview rendered** — the first time one ever has,
  since it is the first document whose R2 object actually exists. **What the test found
  is that product matching had never been implemented.** `toDraft` hardcoded
  `productId: null`, so every line of every PO arrived "Unmatched" and a reviewer picked
  each product by hand — twenty pickers on a twenty-line order — even where the document
  printed the exact catalogue SKU. The extraction schema never captured the SKU and the
  prompt never mentioned it, so the column was read and discarded. Fixed: `sku` added to
  `PoLineItemSchema` (nullable, never optional — a missing key means the model forgot the
  field, and treating that as "no code" would quietly stop matching) and to the prompt,
  which now names the column's aliases and forbids deriving a code from the description.
  `matchProducts` resolves by exact SKU first, then exact case-insensitive name, in **one
  query for the whole document** rather than one per line. Exact only, never fuzzy —
  silently attaching a line to the wrong product misprices an order and the reviewer
  cannot see it happened; archived products are excluded and two active products sharing
  a name match neither. Verified live: all three lines resolved, the form showed them
  pre-selected, the confirmed order carried the right `productId`s. Buyer matching is
  unchanged and still correctly declines a near miss ("Pacific Timber Sdn Bhd" vs
  "Pacific Timber"). All test data removed afterwards — 4 documents, 1 purchase order,
  its line items and stage event, and all 4 orphaned R2 objects. **Known, unfixed:**
  Claude rejects images over 8000px on a side and nothing in the app guards against it,
  so a phone photo can fail extraction with a raw API message.
- 2026-09-07: R2 CORS origins doc fix merged (`fix/r2-cors-origins`) — the bucket policy
  listed `lovinghandsportal.com` but not `www.`, so a presigned PUT from the www host
  failed its preflight while localhost and `*.vercel.app` worked. Documentation only;
  the policy is applied in the Cloudflare dashboard.
- 2026-09-06: Weekly labels and the drawer clamp complete and merged (`feature/weekly-labels-and-po-edit`) — two reports on 2026-09-06. **A weekly axis labelled `6 Jul` reads as Monday's takings rather than the week's**, and the tooltip inherited the ambiguity; weeks start Monday, so the label now runs Monday to Sunday — `6–12 Jul`, or `29 Jun–5 Jul` where the week crosses a month, with the year left off because the range header above every chart already carries it. The bucket *key* is unchanged, so nothing that joins on it moved, and one label source feeds the sales, stage, buyer-trend and product-trend charts, so all four changed together. Two follow-ons the wider label forced: `ChartScroller`'s floor was a flat 24px a bucket — enough for `6 Jul`, nowhere near enough for `31 Aug–6 Sep` — so it now sizes from the longest label, counting only the ticks the axis will really print; and the `Math.ceil(n / 12) - 1` interval formula that decides that, duplicated in three charts, became `axisInterval` in `charts/labels.tsx` so the scroller and the axes cannot drift. The tooltip read `27 Jul–2 Aug — RM 252,487.41`, two dashes side by side, so its separator became the `·` used everywhere else. **The second report — "I can't edit" on the PO detail page — was not the edit sheet.** It opened correctly (page dimmed, ✕ present, the whole form inside) but the panel was **12px wide and off the right edge**. Tailwind v4 resolves `max-w-<name>` against `--spacing-<name>` before `--container-<name>`, and this system names its spacing steps `xs`, `sm`, `md`, `lg`, so the compiled CSS was literally `.max-w-sm{max-width:var(--spacing-sm)}` — **12px, not 24rem** — and `.max-w-xs` 8px, `.sm\:max-w-lg` 24px. **Every Sheet, Dialog and Tooltip in the app was clamped, and had been since Phase 01**: `sheet.tsx` is untouched since install and `tailwindcss: "^4"` floated to 4.3.3. `--container-panel-xs|sm|md|lg` are names the spacing scale cannot shadow, mapping 1:1 onto the sizes the primitives asked for; recorded in `context/design-system.md` beside the ink-tertiary deviation. Two further traps, both measured rather than assumed: `data-[side=right]:sm:max-w-*` outranks a caller's plain `sm:max-w-*` on specificity, so the drawer opened at 384px while asking for 512px — and *removing that prefix did not fix it*, because tailwind-merge does not treat `max-w-panel-sm` and `max-w-panel-lg` as one conflict group, keeps both, and lets stylesheet order hand it back to `panel-sm`; `SheetContent` now applies its default in code, guarded on whether the caller supplied a `max-w-`. Verified: the drawer opens at 512px on desktop and 75% of the viewport on a phone, and a real edit saved, toasted, appeared in the summary and logged to Activity as "Edited: buyer reference" before being rolled back (the two audit entries remain, which is correct); weekly labels checked at 9, 14 and 53 buckets, the 53-week axis thinning to every fifth tick with no overlap; a sweep over 9 routes × {390, 768, 1440} clean on all 27.
- 2026-09-06: `poDate` range boundary fixed and merged (`fix/po-date-range-boundary`) — carried as "known, not fixed" since the dashboard-charts brief, where Last 30 days showed **38 purchase orders and RM 737,667.95** in the KPI, the summary and the table but **RM 673,967.79** in the daily chart. **Not a chart bug and not two queries:** both figures came from the same fetched rows. `poDate` is `@db.Date`, and a timestamp parameter compared against a `date` column is truncated to a **UTC** calendar date — midnight on 8 Aug in Kuala Lumpur is `2026-08-07T16:00:00Z`, whose UTC date is the **7th**, so `gte` admitted a whole extra day. Confirmed by binding the bounds directly: `gte 2026-08-07T16:00Z` returned **38** rows, `gte 2026-08-08T00:00Z` returned **35**. `salesSeries` then dropped the three 7 Aug orders (RM 63,700.16) because their KL bucket key was not on the axis — correctly; the query was a day too wide, not the chart. The `to` end was always right (23:59 KL is 15:59 UTC the same day), which is why only the opening day was ever wrong and why the weekly view appeared to agree — the extra day fell inside a bucket it happened to draw. `dateColumnRange` in `src/lib/dates.ts` returns UTC midnight of each end's KL calendar day, making the truncation a no-op; applied to all nine `poDate` range filters, including the raw `UNION` behind the purchase-order list, its count and its total. Verified against the live database: KPI and chart totals agree for every preset × aggregation with **zero orders outside their buckets**, and the boundary is exact both ways — `from=2026-08-07` returns the three orders, `from=2026-08-08` returns none. **The dashboard's headline figures changed as a result**: Last 30 days is now 35 orders and RM 673,967.79. The old numbers counted a day outside the range the page claimed, and the comparison period no longer overlaps the current one, so the "vs. previous period" delta moved too.
- 2026-09-06: Mobile and engagement pass complete and merged (`feature/mobile-and-engagement`) — the 2026-09-06 `/ui-review` request, the third of the day. Desktop passed; **mobile failed**, and three findings were unreadable rather than merely cramped. One measurement caused most of it: the shell left **246px of a 390px viewport** for content (64px icon rail + 40px padding a side), which is why the buyer trend chart had **86px of plot for 13 buckets** and `StageStepper`'s `grid-cols-6` handed **29px cells to 48–73px labels** ("Ipeodductpiassveedhouse"). The rail is gone below `lg` — `MobileTopBar` (wordmark + account, sticky, painted into the top safe-area inset) and `MobileTabBar` (four 56px destinations, fixed, `env(safe-area-inset-bottom)`), with `NAV`/`isActive` extracted to `components/portal/nav.ts` so the two navs cannot drift — and `main` steps `p-md sm:p-lg lg:p-xl`. Content went to **350px**, which is what made everything else fixable without special-casing. Shipped: `ChartScroller` (a floor of `axisWidth + buckets × 24px`, scrolled inside the card with edge fades, round all four Recharts charts — dashboard sales plot **86px → 768px**), the stepper vertical below `sm` sharing one `StageNode` with the canvas's horizontal track above, `DataTable` card mode below `md` (title from column one, the rest a `<dl>`, `mobileHidden` dropping both avatar columns from the PO list, sorting moved to a select since a card has no header to click — all five consumers at once), `SegmentGroup` replacing five copies of one strip class that clipped instead of scrolling and alone caused the dashboard's **122px** and Products' **38px** document overflow, two-up KPI rows with `break-words` (Top buyer clipped to "Northwii Traders" at 768px) and `mobileFull` for money (**"RM 29,175.52" measures 161px against 125px** of a half tile, and the spec forbids wrapping money), 44px touch targets below `sm`, `SkipLink`, and a `viewport` export with `viewportFit: "cover"` — without which every safe-area inset is 0. Engagement: `WorkQueue` leads the dashboard, reading `data.intake` which was already loaded and unused, and **renders only when there is work**, so it is not the always-on intake bar deliberately removed earlier the same day; its links carry no date range because a draft has no `poDate`. "hover a point" → "tap or hover"; the sales area fill went from ink at 0.06 (invisible) to the brand purple while the line and extremes keep their meanings; Upload leads with **Take a photo** and a rear-camera `capture` input below `sm`; product cards two-up. **`--color-primary` computed to `#292d34`, not `#7612fa`** — the `@theme inline` block re-declares it as `var(--primary)` and `:root` points that at ink, so **no focus ring in the app had ever been purple** since Phase 01; ink is right for `bg-primary`, so the rebinding stays and the ring moved to a new unshadowed `--color-focus`, 37 files swapped, recorded in `context/design-system.md`. The `DataTable` edge-fade logic came out into `useEdgeFades` rather than being written twice. Verified by a scripted sweep over 8 routes × {390, 768, 1440}: zero horizontal overflow, zero clipped text, zero sub-44px standalone controls on phone, all 24 combinations clean; 326 tests, build and lint pass. Prettier reformatted ~40 files it was not asked to touch (semicolons across every shadcn primitive, imports re-wrapped in `ReviewForm` and `useUploadQueue`); every formatting-only diff was reverted before commit. **Known, not fixed:** a KPI row mixing half tiles with a full-width money tile leaves one empty cell where the money tile starts a new row — every fix trades away either the canvas's tile order or DOM/reading order.

- 2026-09-06: Dashboard interactions brief complete and merged (`feature/dashboard-interactions`) — the second 2026-09-06 `/ui-ux-pro-max` request. **Count-up is back**, at 2s, after being cut that morning; the rule that made the old one unsafe is fixed rather than repeated, so the server figure is the initial state and the first paint, the count runs after mount, a range change continues from the frame on screen instead of restarting at zero, and `prefers-reduced-motion` skips it (`useCountUp`, `CountUp`). It covers the KPI tiles on every page, the six "In this range" tiles, the product KPI row and the single-metric card headings, but not chart labels or table cells. Donut legends link every named slice to its detail page and **"Other (n)" unfolds in place**, `shareBy` keeping the folded members with their share *of the whole* so an unfolded row ranks on the same scale as a top-five slice; the ring keeps one grey Other arc, because unfolding it into arcs would need hues past the six the palette validates. The same treatment went to the What-they-buy bars, and product names in the price-drift list became links. The **sidebar is `sticky top-0`** — a plain `h-dvh` aside stopped at the fold and left its surface and right border hanging mid-page. **Easing took three passes and the exponent was never the problem:** cubic, then quadratic, were both reported as not feeling like they slowed down, because the figure repainted on every frame to the last one, and sixty changes a second is a blur whatever the curve does to the increments. The repaint rhythm now decelerates too — every frame at the start, widening to 150 ms gaps — measured at 35 paints over 1.9 s with final steps RM 14,467 → 181, and Purchase orders counting 0 → 38 through 29 integers with its last gaps at 192 and 242 ms. Three other defects fixed: the mount animation was skipped **in development only**, because React double-invokes effects and the second pass read a start ref the cancelled first pass never wrote; the first frames rendered **negative money** ("-RM 8,851.78" under Total sales) because an animation frame already in flight carries a timestamp from before the effect ran, making progress negative under an ease-out; and linking the PO number in the product order history nested `<a>` inside `<a>` and failed hydration, since `DataTable` already wraps the first cell of every row in a link to `rowHref`.
- 2026-09-06: Dashboard charts brief complete and merged (`feature/dashboard-charts`) — the first of two 2026-09-06 `/ui-ux-pro-max` requests. The trend card split into two: **Sales over time** with a *Sales · Quantity* switch (`?measure=`, Quantity summing line-item units through `pickMeasure`), then **Order stage**, the stacked stage chart headed "27 orders still open" with the confirmed count dropped and the 14px stage bar — counts and links intact — moved under it as its legend. The Status-breakdown *intake* bar left the dashboard; that backlog is read from the Purchase orders chips. Every Recharts chart (dashboard sales and stage, buyer product trend, product price trend) now animates 800 ms ease-out on load and on data change and carries whole-number value labels, drawn by one `content` renderer in `src/components/charts/labels.tsx` that hides zero buckets and spaces labels from the plot width. Sidebar label became **Purchase Orders** (title case, the one deliberate exception to the sentence-case rule, at the user's request) and the wordmark links to `/`. Six defects found and fixed: stage totals vanished on bars whose top segment was zero, so the totals ride an invisible `Line` — a `LabelList` on the top segment goes missing wherever that segment is zero, and every segment is zero somewhere; that line then leaked into the tooltip as an unnamed ": 8", so the tooltip filters its payload to stage keys; labels sampled every nth index skipped busy days, so `labelledIndices` walks the busy buckets instead; the quantity y-axis printed `931.84000000001` from the 1.12 headroom multiplier; end-point labels ran into the axis and the card edge; and the average and list-price reference labels were positioned at `"right"`, off the svg, so they had never been visible at all. **Known, not fixed:** `poDate` is `@db.Date` and the range filter is cast to a UTC calendar date while buckets are built in Kuala Lumpur time, so on "Last 30 days" three orders dated 7 Aug sit in the KPI, the summary and the table (38 POs, RM 737,667.95) but outside the daily chart (RM 673,967.79); the weekly view agrees because the week of 3 Aug is a bucket. The fix belongs in every query that filters `poDate` by range, not in a chart.
- 2026-09-06: Click-feedback pass complete and merged (`feature/click-feedback`) — the 2026-09-06 `/ui-ux-pro-max` request. **Tailwind v4's preflight sets `cursor: default` on `<button>`**, so every chip, segment, sort header, pill and icon button showed an arrow while links showed a hand; one rule in `globals.css` `@layer base` now gives enabled buttons, `[role=button]`, `<summary>`, selects and checkbox/radio/file inputs the pointer and disabled ones `not-allowed`, so no component carries `cursor-pointer` itself. A busy button gets `progress` rather than `not-allowed`, scoped to the control so rows inside an updating table keep the hand. The brief's G1 had shipped the top progress bar and the "Updating…" hints but nothing on the element you clicked — a chip reads its selected state from the URL, and the URL only changes once the server answers, so it sat untouched for the whole round trip. Shipped: `Spinner`, one 14px `currentColor` ring on a 0.8s loop (the ring Sonner already spins, never the brand gradient, slowed rather than stopped under `prefers-reduced-motion`); `usePendingChoice` + `ChoiceButton`, giving range presets, aggregate segments, status and quick-filter chips, the sort strip, grid/list and the chart toggles an optimistic selection with the spinner on the clicked option and siblings dimmed under `aria-busy`, the local choice dropped when the server's value lands so a superseded write cannot leave a stale selection; `DataTable` taking its arrow and spinner on click and fading the previous rows to 60% instead of blanking them; `<Button pending>` on every button that waits; and `LinkSpinner` over `useLinkStatus` for the gap between a route click and its `loading.tsx`. Verified against the reseeded database — cursor audit clean on Dashboard (63 elements), Products (34) and PO detail (13); "Last 60 days" flipped and spun with siblings dimmed, settling in ~340 ms; sorting Total took the arrow and released PO date's in the same frame; Next paged with rows at 60% while "Page 1 of 41" held. The zero-count tiles on the Buyers attention strip keep `cursor-default` deliberately — an empty category is nothing to fix, not something forbidden — and gained the "Nothing to fix here" title the Products tile already had. **R2 now authenticates** and signs presigned URLs correctly, but the seed writes `Document.r2Key` values without uploading files, so every seeded document returns `NoSuchKey` and still shows the preview error state; a real upload has never been run end to end.
- 2026-04-12: Respond.io API crawler built and first full crawl completed (1,582 contacts) — **retired 2026-09-05**
- 2026-04-12: Started Playwright automation for "Conversation Opened By" field — **retired 2026-09-05**
- 2026-09-04: Respond.io crawler and `/dashboard` marked for retirement (Phase 01). Portal spec set written in `docs/specs/`.
- 2026-09-05: Design review applied to the canvas and to every spec. Upload left the sidebar; the dashboard leads with a work queue and folds its analytics away; a totals mismatch locks Confirm on the review screen; one status palette; sentence-case labels; truncation recovery; KPIs render their real value on first paint. Canvas sources now live in `docs/design/`.
- 2026-09-05: Renamed ZenGarden to Loving Hands across the specs, context files and all twelve artboards; seed addresses moved to `@lovinghandsportal.com` and the canvas bundle and design spec became `loving-hands-*`. Business, data model and product catalogue unchanged. Fixed two latent clipping bugs surfaced by the new name: every wordmark variant used `line-height: 1`, which cropped the descender of "Loving" under `background-clip: text` (the sidebar mark also moved up to the on-system `heading-md` 26px), and the Main/Buyer chart x-axis labels were clipped to their own flex cell instead of overflowing into the empty neighbouring ones.
- 2026-09-05: Phase 01 §1 — Respond.io crawler, `/dashboard`, `src/lib/dashboard` and the four `crawl*` scripts deleted. `recharts` kept for Phase 06.
- 2026-09-06: Phase 09 complete and merged, closing the spec set — the `(admin)` shell with its own top bar and a `requireSuperAdmin()` check behind the Phase 02 proxy rewrite, pending access requests with approve/decline wired to the Phase 02 emails, the users table with status derivation and the reset-password split, and `UserDrawer` with create, update, set password and soft delete. Verified against the seeded database: approving a pending request created the user as MEMBER, marked the request APPROVED with the decider and timestamp, and hid the empty section; the delete dialog stayed disabled for a near miss and a prefix and enabled only on the exact address (case-insensitive, trimmed); Pending and Invited render as neutral text in amber rings, distinct from the amber-text "Needs review" badge; a Google-only user shows "Password managed by Google" with an explanatory title and no reset link. All test data was removed afterwards. 19 tests cover the safety rules — no self-demote, no self-disable, never the last *active* super admin, `sessionVersion` bumped on disable and on set-password, and soft delete keeping the row so uploads and stage events stay attributed.
- 2026-09-06: Phase 08 merged, image editor deferred — `twelveMonthWindow` exported once so the KPI row, the cards, the footer summary and a product's order history cannot read different windows; `productStats`, `priceTrend`, `whoBuysIt`, `boughtTogether`, `needsAttention`; the catalog with a clickable Needs-attention breakdown driving the quick-filter chips; product detail with six stat tiles, price trend against the list line, who buys it, bought together and order history; `ProductSheet` for create/edit/archive with `ProductPrice` appended only when the price moves. Verified: the unfiltered KPI row and footer read identically, the Orders tile matches the history row count on two products (139 and 134), the below-list highlight carries both figures in `title` and `aria-label`, and editing a list price left the old value in history. Four defects fixed: the KPI row and footer differed by 9.3e-10 because float addition is not associative and the footer sums a sorted copy; the footer offered "10 per page" beside twelve cards; images that failed before hydration kept a broken icon because `onError` is never replayed; and my product categories were invented rather than taken from the seed, so four of seven did not exist. **The image editor is deferred** — see the status note above.
- 2026-09-06: Phase 07 complete and merged — the buyer analytics (`reorder`, `buyer-status`, `product-mix`, `product-trend`, `sparkline`) with 25 tests, the roster whose attention counts and table filter are one control, and buyer detail (five KPIs, order trend, product trend with a six-product picker, what-they-buy donut and bars, reorder signals linking to a preselected upload, a details card that renders no blank rows, intake bar, their POs). Buyer names became links everywhere. Three defects found and fixed: `listBuyers` pulled every line item's quantity, amount and product name when the roster needs product ids alone, costing 2.1s against 0.28s; the product picker assigned colour by position in the selected array, so deselecting the first product repainted the survivors — the URL now keeps freed slots (`?products=,b,c`) so an assignment survives a deselect; and a five-tile KPI row whose first tile spans two columns wrapped its last tile onto its own line.
- 2026-09-05: Phase 06 complete and merged — the pure analytics library (`buckets`, `range`, `sales`, `fulfillment`, `share`, `churn`, `price-drift`) with 70 tests, `loadDashboard` at 422 ms for Last year daily, and the page in its specified order: three KPI tiles, one trend card, the two status bars, the collapsed disclosure, the table last. KPI figures cross-checked against independent raw SQL — 400 orders, RM 8,161,352.29, 11 buyers. Three defects found and fixed: `buckets.startOf` never truncated the time for daily aggregation, so Last 30 days ending now drew 31 columns; the donut and line-chart palettes reached for `--color-primary`, which shadcn's `@theme inline` block rebinds to ink, so the validated hues were never the rendered ones (now unshadowed `--color-share-1..6`); and Recharts' default bar animation meant a screenshot caught an empty plot, the same failure the KPI count-up rule exists to prevent. **Known, not fixed:** `--ring` is set from `--color-primary` and is therefore ink rather than the purple the design system specifies — a Phase 01 issue affecting every focus ring in the app.
- 2026-09-05: Phase 05 complete and merged — the shared table machinery (`DataTable` taking `onSortChange`, `TablePagination`, `parsePagination`/`parseSort`, status and stage badges), the merged list over `PurchaseOrder` and `Extraction` as a parameter-bound `UNION ALL`, the filter row with live chip counts, and the detail page (breadcrumb, Lifecycle card, `StageStepper` with the breathing loop, document/data split, Activity, revisions, edit sheet). `advanceStage`/`revertStage` guard the update on the stage the caller last saw. Verified against the seeded data: advance, super-admin move back with a required note, and an edit appearing in Activity — all rolled back afterwards. **Criterion 4 is unverified** (R2 placeholder) and criterion 8 is covered by unit tests rather than two real tabs. The database caught three things the types could not: Postgres refuses an `ORDER BY` over a `UNION` that uses an expression rather than a result column name; "Confirmed by" ascending sorted the backlog to the bottom because ASC defaults to NULLS LAST, not NULLS FIRST as my comment claimed; and clearing the filters left the search text in the box. Two review findings from the first half were also fixed before shipping: `DataTable` hardwired its own URL writing, which would have stopped Phase 08's segmented control sharing sort state, and `StatusDot` took a `text-*` class where a background was needed. The edit sheet deliberately omits money and line items — editing totals after confirmation would bypass the Phase 04 totals gate and its audit entry.
- 2026-09-05: Phase 04 complete and merged — `PoExtractionSchema`, the extraction system prompt, `extractPurchaseOrder` over `messages.parse` with `zodOutputFormat`, the shared `runExtraction` runner wired into `/api/upload/complete` and `retryExtraction`, `/api/documents/[id]/url`, the review screen (react-pdf source column, draft form, buyer/product comboboxes, line-item editing with amount recompute, 800 ms debounced `saveDraft`), the totals gate, the duplicate check with revision numbering, and `confirmPurchaseOrder`. **Criterion 1 is unverified** (`ANTHROPIC_API_KEY` is a placeholder) and the source column cannot load (`R2_ACCOUNT_ID` likewise); everything else was verified against the seeded Neon database, including a full confirm that wrote a PO, six line items and a System stage event before being rolled back. A review pass found four defects, all fixed: the upload queue ignored the extraction result so a document Claude could not read still showed "Uploaded" and was counted in "Review N files"; the upload footer never linked to `/review`, leaving the whole multi-file review journey unreachable; the deferred "Extracting" row state was missing; and the review form defaulted `poDate` from UTC, pre-filling yesterday between midnight and 08:00 KL. Fixing them also surfaced two more: Retry re-uploaded a file that had arrived intact rather than asking for another read, and the queue's status vocabulary lived in the hook, coupling anything that reasoned about a row to the server actions and Auth.js.
- 2026-09-05: Phase 03 complete and merged — presign / complete / delete route handlers, `deleteOrphans()`, the `useUploadQueue` state machine (three concurrent XHR uploads, live progress, `beforeunload` guard), Dropzone with drop/browse/paste, one progress-bar geometry, plain-language failure reasons, the ready-only footer count, and "Upload PO" wired on Dashboard, Purchase orders and Buyers. **Criteria 1, 3, 4 and 8's enabled state are unverified**: R2 still holds placeholder credentials, so no browser PUT can reach the bucket. Re-run them once `docs/specs/SETUP-CHECKLIST.md` §2 is done. Fixed three defects found while building: `presignPut` pinned `ContentLength` to a ceiling rather than the file's exact size (S3 signs it exactly, so every real upload but one would have been refused); the `Document.r2Key` unique constraint needed a unique `pending:` placeholder because the key contains the row's own id; and the queue pump read a ref during render and drove state from an effect.
- 2026-09-05: Phase 02 complete and merged — Auth.js v5 with Google (approval-gated) and Credentials, database-backed rate limiting, forgot/reset/change password, five email templates, `src/proxy.ts` route protection, real `auth-guards.ts`, and the sidebar reading the real session. `auth-auditor`: 0 Critical, 0 High; both Mediums and three of five Lows fixed, the two accepted ones reasoned in `docs/audit-results/AUTH_SECURITY_REVIEW.md`. Added the `/admin` stub that acceptance criterion 5 measures against but Phase 01 never shipped, a password reveal toggle on every password field (not yet on the canvas), and two `@theme` tokens: `--spacing-control-oauth` and `--container-auth-card`.
- 2026-09-05: Phase 01 complete and merged — shadcn re-skinned to the tokens, Prisma 7 + Neon schema and first migration, deterministic seed, R2 / Resend / Claude / money / date / stage libraries with unit tests, App Shell with sidebar and placeholder pages.
- 2026-09-06: UI change brief (`docs/specs/20260906_UI_change.md`) complete and merged — the 2026-09-06 Critiquito review of the live portal. **The reported "laggy / numbers jump" was the KPI count-up, not a refetch**: the recorded Dashboard readings, 13 POs / RM 254k then 38 / RM 737k, are both 34% of the final figures, which is one frame of `useCountUp`'s ease-out cubic; Buyers 2 → 11 and Products 11 → 12 were the same hook on other tiles, and the database holds 400 POs, 11 buyers and 12 products throughout. A count-up cannot satisfy the brief's rule that no headline number may look final and then change, so it is gone and the tiles render their server value only — **a deliberate departure from the canvas and from `00-master.md` §4 "Numbers render final, then animate"**. The real navigation wait had never been addressed: every portal page is `force-dynamic` and `src/app` held no `loading.tsx` at all, so a click showed nothing until the server answered. Shipped: ten route-level skeletons off a shared `Skeletons` kit; `useUrlNavigation`, through which every URL write in the app now runs, its transition driving one `NavProgress` top bar and the `UpdatingHint` in each summary line; pending labels on Advance, Move back, Approve and Decline; `BackLink` on PO, Buyer and Product detail and on Upload; two-line wrapping for the sidebar email and the Top buyer / Best seller KPIs; `--color-ink-tertiary` `#838383` → `#6f6f6f` (3.79:1 → 5.02:1 on canvas), recorded as a deviation in `context/design-system.md`; a sticky first column and scroll-edge fades in `DataTable`; `pl-md` on the PO detail numeric columns; `Download original` and `Try preview again` beside the PDF error; an "Image unavailable" tile that also catches an image which failed before hydration; the upload queue's reserved "No files yet" region; and the Dashboard intake and stage counts as links into the rows they count. Two defects found and fixed while building: those dashboard links first carried the date range on all four intake statuses, but drafts have no PO date and `listPurchaseOrders` drops the extraction branch the moment a date bound is present, so "Needs review 3" landed on an empty table — only Confirmed carries the range now, verified 3 counts → 3 rows; and `BackLink` first tested `document.referrer` alone as the brief's rule 5 says, but client-side navigation never rewrites the referrer, so Back discarded the user's filters — it now also compares `history.length` against a baseline captured in the shell when the document loaded, verified across `?status=confirmed&stage=DELIVERING` and a deep-linked product. **Not done:** per-status counts on the PO list chips (§3, Should) need a new aggregate — the list query returns `needsReview` alone. **Unverified:** the admin screen's progress bar, pending labels and skeleton are covered by build, types and lint but were not exercised in a browser, because the seeded member is not a super admin and the super admin is Google-only. R2 still holds placeholder credentials, so the PDF preview error state is what every document shows; that is the case the brief reported and it now recovers, but a successful preview was never seen.

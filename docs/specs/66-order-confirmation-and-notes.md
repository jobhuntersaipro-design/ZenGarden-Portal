# Phase 66 — Lighter confirmation, three greens approve, notes on a PO

**Goal:** Three small changes to the order, shipped together before the stage
and shipment work: delivery date and payment terms become optional at
confirm, an order whose every product is green on all three certificates is
approved with no other condition, and staff can leave a note on a PO without
moving its stage.

**Branch:** `feature/order-confirmation-and-notes`, from `main`.

Asked for as (2026-10-16): "Make delivery date and payment term optional for
each PO", "Auto approve when 3 greens from certificates … Make sure we do
that", "Let user add notes for PO level in portal".

## 1. Delivery date and payment terms are optional

### What is there today

- `confirmWebOrder` (`src/actions/web-orders.ts:85–104`) refuses a blank
  delivery date ("An expected delivery date is required.") and blank payment
  terms ("Payment terms are required."). The confirm form gates the same two
  (the 2026-09-17 "says which is missing" change).
- The scan review (`/review/[id]`) and the PO edit sheet already treat both as
  optional.

### Change

- Drop both refusals in the action and both gates in the form. A blank field
  saves as null. The "can't be before the PO date" rule stays for a date that
  *is* given.
- Everything downstream already reads null: the PDF and the buyer's document
  print "—" and the "Our team will confirm the expected delivery and payment
  terms" note (Phase 45); the confirmation email says "we will email the
  delivery date" (the auto-approval path already sends this one); setting the
  date later emails the buyer as a first date (2026-10-14).
- The labels lose nothing but the error states; add "(optional)" to both.

### Tests

The two refusal tests in `confirm-web-order.test.ts` flip: a blank date and
blank terms now confirm and store null. Keep the before-PO-date refusal test.

## 2. Three greens approve the order — the only condition

### What is there today

`autoApproveWebOrder` (`src/lib/web-order-confirm.ts:142`), run after a shop
order is sent (`src/actions/cart.ts:439`), already approves when every
product is green on NOT, HL and COA — **but it also returns false when the
buyer has no payment terms on file** (line 150). So a buyer with no terms
never auto-approves, however green the products are. That is the likely
reason the customer asked.

### Change

- Remove the payment-terms condition. Terms are used when the buyer has them
  and left null when not (§1 makes null legal).
- The remaining conditions are the certificate check itself plus guards that
  are not business rules: the order is `SUBMITTED`, has at least one line, and
  the draft parses.
- **Scope: shop orders only.** An uploaded PO is not auto-approved, because a
  person still has to check what the AI read off the document (the review
  screen exists for that). Say so in the spec reply; reversible later.

### Tests

- A buyer with no payment terms and an all-green order → `CONFIRMED`, no
  confirmer, terms null. Watch it fail against the current code first.
- One amber or red dot → stays `SUBMITTED` (existing test, kept).

## 3. Notes on a PO

### What is there today

- **Remark** (`PurchaseOrder.notes`): one field in the edit sheet; each edit
  overwrites it.
- A note can ride on a stage move (the Advance popover), and shows in
  *Notes and activity*.
- The feed already has a **Note** pill reserved for a note with no activity
  (2026-09-18) — nothing writes one yet.

### Change

- An **Add note** box at the top of *Notes and activity* on
  `/purchase-orders/[id]`: a textarea and **Add note**. Each note is its own
  row: Note pill, the text in quotes, `name · role · date, time`.
- Stored as a `PoStageEvent` of a new `PoEventKind.NOTE`, `toStage` = the
  order's current stage, `fromStage` null, `note` = the text. One additive
  enum value, so the feed, its paging and its actor/role code are reused, and
  the stage replay ignores it (it only reads `STAGE` events — test it).
- Who: a new permission `po.note`, default on for every ops role, including
  Member. Staff only — nothing on the shop reads notes.
- 1–2,000 characters, trimmed. No edit or delete in this cut (an audit trail
  that can be rewritten is not one); a super admin can ask for delete later.
- The Remark field stays as it is.

### Tests

- Adding a note writes one `NOTE` event and the feed shows it first.
- `stageAt` replay ignores `NOTE` events (fixture with a note between moves).
- Member can add; a buyer session gets 403 from the action.

## 4. Acceptance

1. A shop order confirmed with no date and no terms reads "—" on the PO, the
   PDF and the buyer's page, and the buyer's email says the date will follow.
2. An all-green order from a buyer with no terms auto-approves.
3. A note added as a QC user appears at the top of the feed with "QC" and the
   time; the stepper and the Demand Board stage chart do not move.
4. No overflow at 390 / 1440; the note box and button 44px at 390.
5. Tests, `tsc`, lint, build clean.

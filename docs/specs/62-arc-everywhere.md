# 62 — The rest of Arc, on real screens

Asked for on 2026-10-01: "is everything implemented as Arc preview already?"
— answered no: 30 of the 73 vendored parts were on real screens, 43 only on
`/admin/arc` — then "Ok, start everything / just push to main I will review it
on prod". This phase puts the remaining parts to the jobs spec 60's gallery
gave them, in Arc's look on our tokens, and adds the two new features that
list named (⌘K search, notifications).

## 1. Where each part went

| Arc part | Job here |
|---|---|
| line-chart | Product price trend (avg price solid, list price dashed) and the stock count trend. A month with no sales is left off the price line, since Arc reads a missing value as 0 |
| gauge | On-time delivery: the business's own rate over **distinct** orders (`DeliveryPerformance.onTime`, new), above the per-market rows |
| slope-chart | Market mix: each market's share before → this range (`MarketSlope`, a client wrapper — the card is a server component) |
| sparkline | The buyer roster's Trend column |
| activity-heatmap | Buyer page: purchase orders per day over the last 12 months (`ordersPerDay`) |
| calendar | `DateInput` (`ui/date-input.tsx`): every native date input — review PO date, shop-order and PO edit-sheet expected delivery, Demand Board "up to", stock "counted on". Speaks `yyyy-mm-dd`, so no schema changed |
| date-range-picker | Dashboard custom range (mounts after hydration — Intl differs between Node and Chrome) |
| password-field | `PasswordInput` draws Arc's shell and eye around our label and per-field toggle names |
| password-strength | The new-password field on reset and forced change, on `passwordSchema`'s own rules (10 chars, a letter, a digit) |
| phone-input | `PhoneField`: buyer form, buyer details, contacts. Malaysia first; stores the international form people already wrote (`+60 12-345 6789`); a local `012-…` opens as +60 |
| radio-cards | The user drawer's role, with what each role does by default |
| combobox, multi-select | Our review Combobox and the trend series picker wear Arc's control, options and listbox — Arc's own lack create rows, pinned rows, ranked figures and colour slots |
| file-dropzone | Upload page target, handing each batch to our queue (validation and reasons stay in the queue) |
| progress | Upload queue and buyer-document bars, fill in the status palette |
| skeleton | Stock drawer: Arc's skeleton crossfades into the counts |
| empty-state | Every `DataTable` empty state (`emptyDescription`, new prop) |
| text-shimmer | "Reading the document…" |
| text-morph | Add to cart → Added |
| metric-card | KPI tile surface (border, radius, resting shadow); Arc's own card counts a bare number up from zero |
| copy-button | PO detail: Order ID and PO number |
| split-button | A super admin's Advance, with Move back in its menu (its dialog and required note unchanged) |
| action-button | Permission grid Save and profile Save (Saving → Saved) |
| confirm-morph | Review screen Discard, asked in place |
| swipe-actions | Cart lines swipe left to Remove on a phone; the row's own remove stays the accessible path |
| accordion | New buyer form's optional fields |
| scroll-area | Stacked stage chart (`ChartScroller`) and review line items |
| timeline | Admin buyer activity (day groups; role beside the name; a PO row opens to its link) |
| tree-view | A product's family, by market |
| avatar-group | PO detail: who handled it |
| hover-card | Demand Board committed table: a product name previews the row |
| carousel | Shop product photos (two or more) |
| inline-edit | Catalogue value renames |
| resizable-panels | Review screen document and fields, from `xl` (stacked below) |
| filter-toolbar | Products toolbar: brand, category and market through Add filter and chips |
| command-palette | ⌘K / Search: pages, the latest 300 POs, buyers, products — read once, scoped by permission (`actions/shell.ts`) |
| notification-center | The review queue as updates, with Open to each review screen; read and dismissed per browser |

**Not used, on purpose:** `bar-chart` (the stage board stacks; Arc's cannot),
`file-upload` (the dropzone and queue do its job), `bottom-sheet` (the phone
filters stay a disclosure — `MobileFilters` records why a sheet was refused),
`toast` (the stack is `toast-stack`, already in use), `blocks` (demo
compositions). The dashboard's More analytics stays a URL-driven server
disclosure rather than Arc's accordion, which mounts everything.

## 2. Import patches (`scripts/arc-import.ts`)

All through `PATCHES` with `replaceOnce`, which throws when its target is gone:

- **gauge** starts at its value: a figure never paints zero first (00-master §4).
- **password-field** exports `EyeMorph`.
- **phone-input** gains Malaysia (`+60`, 9–10 national digits).
- **command-palette** lists at most 50 rows, so hundreds of indexed rows stay fast.
- **notification-center** gains `onOpenItem` (an Open action).
- **tree-view** rows are 44px (46 with the gap, in the TSX too, since the row
  height is animated in JS).

## 3. Found while driving

- The market-mix card passed formatter functions from a server component to
  Arc's slope chart: "Functions cannot be passed directly to Client
  Components", a 500 in the dashboard's analytics. Moved into `MarketSlope`.
- `BuyerDocumentsCard` imported the PDF previewer directly, so pdf.js loaded on
  the server (`DOMMatrix is not defined`) on every buyer page — the React #419
  spec 61 saw once. It uses `DocumentPreviewLoader` now. Pre-existing.
- Bell 42px, split chevron 38px wide, tree rows 36px at 390: all 44 now.
- The phone field was cut off in half a row; it has its own row.

## 4. Verified

Local Postgres 16 and the seed, production build, signed in as a super admin.
- 15 portal and admin pages × 1440 and 390: no page overflow, no console error
  beyond Vercel Speed Insights' script (absent off Vercel), 0 server errors.
- Driven: ⌘K "acme" lists Acme's POs; the bell lists the 3 read uploads; the
  calendar opens from the review's PO date; split button, avatar group, copy
  buttons on PO detail; heatmap, family tree, price trend, hover card, role
  cards, filter menu render; a catalogue rename through inline edit rewrote the
  label and its product in the database.
- 1788 tests (6 new: distinct on-time count, `ordersPerDay`, `phoneToE164`),
  `tsc` clean, lint unchanged (4 `ShopHeader` errors, 1 warning), build clean.

## 5. Not verified

Production; the shop screens (cart swipe, carousel, Add to cart morph — the
seed has no shop contact and no product photos); a real phone, Safari,
Firefox, a screen reader; the PO edit sheet, stock drawer and range picker
saves end to end; a phone number saved and printed on a PO document.

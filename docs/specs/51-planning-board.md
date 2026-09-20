# Phase 51 — The planning board: what the DC master list actually is

Version 1.0 — 2026-09-20. Audience: AI coders, and the person deciding scope.
Read `docs/specs/00-master.md` first. Status: **analysis and proposal. Nothing built.**

---

## 1. Why this exists

The planning team keeps `ZEN GARDEN DC INVENTORY 2026 MASTER LIST` in Google
Sheets and updates every figure in it by hand. The portal was built from that
sheet's **left three columns** and has never seen the rest. This spec is what
the rest of it turned out to be, what the portal would need to stand in for it,
and the open questions that decide scope.

It supersedes the assumption carried since 2026-09-09 that the file is a
catalogue. **It is not a catalogue. It is a stock ledger with a dispatch plan
laid over it.**

## 2. What the file is, measured

Read with PyMuPDF from the print supplied on 2026-09-20. One page,
**843 × 596 pt** (A4 landscape), **5,786 words**, **722 distinct text rows**
compressed into 298 pt of height — which is why the type is sub-1pt and why a
plain text extraction is nonsense.

### 2.1 The left band: what a row *is*

Three merged label columns, x ≈ 50–80, the only part the portal has ever read:

| Column | Holds | Example |
|---|---|---|
| A | brand, merged down a block | `ZEN GARDEN` |
| B | market + line + pack, merged down a block | `SUPER INDO 2.1L (6) 60CTNS/PALLET` |
| C | variant, one per row | `GOAT'S MILK` |

**336 label rows.** 308 became products; 28 in 5 blocks were skipped because
the variant column nests a second table (hair gel is colours × sizes × packs).

### 2.2 The header band: what a *column* is

Rows y ≈ 54–69, above the product grid. Each column to the right of the labels
is **one outbound consignment**, and the header band is its paperwork and its
logistics:

| Row label | Holds |
|---|---|
| *(unlabelled top band)* | free text: `40FT CONTAINER`, `EMPTY WEIGHT:3760KG`, `4020KG LOAD INTO 20FT`, `CI: 27/12 CO: 30/12`, `DONE.420CTNS`, `CAN ADD ON 2ctns`, `TRENDCELL SHIPMENT ALWAYS ON WEDNESDAY - SWIFT CLOSES ON 2ND & 4TH SATURDAY` |
| *(carrier band)* | `ZEN LORRY`, `SELF PICK UP`, `DASS 24 PLTS`, `HIAP CHENG`, `AZIZUL`, `LAYOUT & DO DONE` |
| `NORMAL PALLET 0 TOTAL OUT` | container / seal numbers — `M2676317`, `YMAU922726` |
| `PURCHASE NO. 6, 12, 16, 18 and 22 plts` | the customer's PO — `PDC2249242`, `SVPPP025120032`, `MDCPO25120101`, `PO-00217` |
| `PURCHASE NO. DATE` | `25/11`, `24/12`, `02/01` |
| `INVOICE NO. (KEY IN BY ADMIN)` | invoice number **tagged by issuing entity** |
| `PERSON-IN-CHARGE OF KEYING IN` | a name |
| `DOs (CONFIRM BY JULIA)` | delivery-order confirmation |
| `DELIVERY DATE` | 77 cells carry one |
| `STOCK` / `CURRENT (CTN) COUNT END IN (1)` / `DEC 2025` | the stock snapshot band |
| `TOTAL CARTONS` | the column's total — `16412`, `20950`, `336`, `543`, `751`… |

**Three invoicing entities appear in the invoice row**, by tag frequency:
**ZEN 53, LHM 16, ZT 16** (plus 6 `ZE`, almost certainly ZEN truncated). The
portal models exactly one company.

**Roughly 99 consignment columns** carry a TOTAL CARTONS figure; 61 of them are
dense enough to carry eight or more product figures.

### 2.3 The body: the numbers are a ledger, not a count

Each product row carries positive and negative figures across those columns.
**1,081 negative cells** against a few thousand positive ones. Read across one
row (`GOAT'S MILK`, ZEN 2.1L):

```
120  240  300  -6  108  -20  -200  -4  -60  -19  -13  -60  -24  [10]  -6  37  -59  -200  -150  420 …
```

The only reading that fits the header band is the obvious one: **a positive is
stock in, a negative is stock out against that column's consignment**, and the
`CURRENT (CTN) COUNT` band is the running balance. `[10]`…`[24]` — 22 of them —
are footnote markers, not quantities.

**Everything in the body is in CARTONS.** The row labels say so
(`60CTNS/PALLET`), the totals row says so (`TOTAL CARTONS`).

## 3. The gap, stated plainly

What the portal has today, after the stock count merged this morning:

- `Product.stockPieces` — nullable, **in pieces**, typed by hand, and by
  explicit decision **nothing deducts it**: not confirming a purchase order,
  not a fulfilment stage.
- `PurchaseOrder` + `LineItem` — a buyer's order, in cartons, with six
  fulfilment stages.
- One company, one currency, no shipment entity.

So the portal can record *that* an order exists and *how far along* it is. It
cannot answer the only question the planning board exists to answer:

> **If I commit these cartons to these consignments on these dates, what runs
> out, and when?**

Five things are missing, in dependency order:

1. **A stock ledger.** Every movement as a row — product, cartons, in or out,
   reason, reference, date — with the balance derived by summing it. Today's
   `stockPieces` is a number somebody retypes; the sheet's figure is the sum of
   a thousand movements. These are not the same kind of thing, and the second
   cannot be built on the first.
2. **Incoming stock.** The positives. The portal has no production run, no
   goods receipt, no supplier delivery. Half the sheet's arithmetic has no home.
3. **Allocation.** A negative in the sheet is a *commitment* — cartons spoken
   for by a consignment that has not shipped. Free stock is the balance minus
   commitments, and the planning team reads the shortfall off exactly that.
4. **A consignment.** The column itself: several POs can ride one lorry or one
   40ft container, with pallets, weight, carrier, CI/CO dates, DO and invoice.
   The portal's six stages belong to a *purchase order*, not to a shipment, so
   nothing in it can say "this lorry leaves Wednesday, 24 pallets, these six
   orders."
5. **Three entities.** ZEN, LHM and ZT issue invoices against these
   consignments. `DOCUMENT_COMPANY_NAME` is a single constant.

**Carton vs piece is a live conflict, not a detail.** The board plans in
cartons; `stockPieces` stores pieces. Both exist and neither converts to the
other without `packSize`, which 28 products do not have and which the sheet
carries inside a text label (`(6)`, `(48PCS/CTN)`).

## 4. What I would build instead of a spreadsheet

**Not the grid.** A 336 × 99 matrix is the shape a spreadsheet forces on you
when a spreadsheet is the only tool available. Rebuilding it in a browser
inherits every weakness — sub-1pt density, no audit trail, no validation, one
editor at a time, and a figure that is right only as long as somebody retypes
it — and adds none of the strengths a database has.

The board is a **view over three tables the portal does not yet have**:

```
StockMovement   product, cartons (signed), reason, reference, occurredAt, actor
Consignment     carrier, vehicle/container, pallets, CI/CO, deliveryDate,
                entity (ZEN | LHM | ZT), DO, invoiceNo, notes
Allocation      consignment × product × cartons   (the negative, before it ships)
```

Balance is `SUM(movements)`. Committed is `SUM(open allocations)`. Free is the
difference. Nothing is retyped, and every figure can name the rows that made it.

### 4.1 The screens that replace the board

1. **Stock on hand** — product, on hand, committed, free, and *weeks of cover*
   at the current rate. Sorted by what runs out first. This is the answer to
   the question the grid is squinted at for.
2. **A consignment** — one page per column of the sheet: its POs, its pallet
   and weight fill, carrier, dates, DO and invoice, and its allocation lines
   with a live shortfall as they are typed.
3. **The forward view** — product rows against *dates*, not against 99
   columns: on hand today, minus what is committed each week, marked red where
   the balance crosses zero. Same information as the grid, one dimension
   smaller, because a consignment's identity belongs on its own page.
4. **Movements** — the ledger for one product, so a wrong balance is traceable
   instead of argued about.

### 4.2 What stays manual, deliberately

Stock in from production stays typed, because there is no factory system to
read. The difference is that it is typed **once, as a movement with a date and
a person**, instead of retyped into a running total that no longer remembers
where it came from.

## 5. Questions I could not answer from the file

These change the model, not the styling. My readings are in brackets.

1. **Is a positive stock in and a negative stock out?** [Yes — nothing else
   fits the header band.] If a negative is instead a *shortfall already
   computed*, the ledger model is wrong and the sheet is a planning output
   rather than a record.
2. **Is one column one PO, or one consignment carrying several POs?** [One
   consignment — the pallet and container notes span what look like several
   PO numbers.] If it is strictly one PO per column, `Consignment` collapses
   into the existing `PurchaseOrder` and this is a much smaller phase.
3. **Are ZEN, LHM and ZT three invoicing entities?** [Yes.] If so, which one
   issues for a given consignment, and does the portal need to print three
   letterheads?
4. **Cartons or pieces?** The board is cartons; `stockPieces` is pieces. One of
   them should move. [Cartons — it is what the team counts, ships and palletises.]
5. **Is `CURRENT (CTN) COUNT END IN (1)` a balance as at a date**, or a
   physical count from a stocktake? The two want different screens: a derived
   balance, or a count that *corrects* the ledger and records the variance.
6. **What are the 22 `[10]`–`[24]` markers?** Footnotes to a legend not on
   this page.
7. **Who may see this?** Pricing and customer names sit beside stock. The
   planning team is not the whole ops team, and `PermissionGrant` already
   exists to scope it.

## 6. Phasing, if it goes ahead

Each phase is useful alone and none of them needs the next.

| Phase | What | Why it stands alone |
|---|---|---|
| A | `StockMovement` + a movements screen; `stockPieces` becomes a derived balance, or is retired in favour of cartons | The balance stops being a number somebody remembers to update |
| B | Incoming stock (production runs / receipts) | The positives get a home; the balance becomes true |
| C | `Allocation` + committed / free on the product | The shortfall question can be asked at all |
| D | `Consignment` + its page | The lorry, the pallets, the DO and the invoice leave the spreadsheet |
| E | The forward view | Only worth building once A–C feed it |

**Do not start at E.** A planning screen over figures nobody trusts is the
spreadsheet again, in a worse editor.

## 7. What this analysis did not establish

- **Anything about how the team actually works.** Every reading above comes
  from one PDF print. Nobody was watched using it, and the questions in §5 are
  the ones a half-hour with the planning team would answer better than any
  amount of parsing.
- **The volumes.** 99 columns on one printed page is what a quarter looks
  like; nothing says how many consignments a year is, or how long a ledger
  gets.
- **Whether the .xlsx exists.** Everything here was read from a print. The
  extractor's own docstring prefers the workbook, and the workbook would carry
  the formulas — which would settle question 1 outright.
- **The 28 skipped rows.** Still not in the catalogue, and still nested.

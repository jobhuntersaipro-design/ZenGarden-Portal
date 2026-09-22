# Phase 55 — Stock counts

Asked for as: "I don't want to let users edit product to update stock count, it
should be separated from that. Stock count should be easy to update, and also
show the activity of stock count, updated by who, when, insert notes if needed.
Also show the stock count trend, user should be able to update historical stock
but that should be logged."

## 1. Where it starts

`Product.stockCartons` is one nullable integer, written from the product edit
drawer and the create form's per-variant column, and read by the demand board,
the product list, the product card, the product detail page and the low-stock
flag. **There is no history of any kind**: who counted, when, or what it was
before. The demand board's "Enter stock counts →" link goes to
`/products?filter=low-stock` — a filtered catalogue, not a counting screen.

## 2. The four decisions, taken 2026-09-22

1. **Its own destination, `/stock`** — a sixth item in the sidebar and the
   phone tab bar. The tab bar is hardcoded `grid-cols-5` and becomes
   `grid-cols-6`, 65px a tab at 390, still clear of the 44px floor.
2. **Both entry paths.** A stocktake sheet for counting many products in one
   sitting, and a single form for one product. They must write identical rows
   or the history lies, so both go through one action.
3. **Append a correction, never overwrite.** A count for a date that already
   has one writes a new row that supersedes it. Nothing is destroyed, and the
   log is free because the ledger *is* the log.
4. **`Product.stockCartons` stays**, caching the newest count, so the demand
   board, the product list, the card and the low-stock flag are untouched.

## 3. The ledger

One new table, one additive migration.

```
StockCount
  id, productId, countedOn (@db.Date), cartons (Int >= 0),
  note (String?), countedById (User?, null = system),
  supersedesId (unique, the row this one corrects), createdAt
```

- **`countedOn` is the day the count is *for***, not the day it was typed.
  That is what makes "update historical stock" ordinary rather than special:
  entering a count for 12 September is the same act whether you do it on the
  12th or the 20th.
- **A row is current when nothing supersedes it.** The chain gives the feed
  its sentence — "corrected 12 Sep from 40 to 46" — without a second table.
- **`Product.stockCartons` is rewritten on every save** to the cartons of the
  current row with the greatest `countedOn`. It is a cache, and the ledger is
  the truth; nothing else may write it.

## 4. The surfaces

- **`/stock`** — three tiles (counted, never counted, low), the stocktake
  sheet, and recent activity. The sheet lists products with a number box each,
  takes one note for the session, and saves what was filled in; a blank box is
  not a count and writes nothing.
- **The product detail page** gains a Stock card: the current count, a trend
  chart over the counts, its own history, and a single-product count form.
- **The product edit drawer and the create form lose their stock fields.**
  That is the request: stock is not a property you edit on a product.

## 5. What this deliberately does not do

- **Nothing deducts stock.** A count is a stocktake figure somebody types, as
  it has been since Phase 43. Confirming an order does not move it.
- **No stock on the shop.** The leak test that forbids `stockCartons` in every
  shop-facing select still stands and gains the new table.
- **No negative counts.** Zero is a count; below zero is not a quantity.

## 6. Acceptance criteria

1. The product edit drawer and the create form carry no stock field, and
   `updateProduct` ignores one if sent.
2. A count saved from the sheet and the same count saved from the single form
   produce identical rows.
3. A second count for a date already counted supersedes the first, both rows
   survive, and the feed names the change.
4. `Product.stockCartons` equals the current count with the greatest
   `countedOn`, proven after a correction to a *past* date does not change it.
5. The trend draws a point per count, and the activity names who, when and the
   note.
6. A blank box in the sheet writes nothing.
7. No horizontal overflow at 390, no control under 44px, on `/stock`.

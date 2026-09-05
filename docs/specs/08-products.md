# Phase 08 — Products

Branch `feature/products`. Depends on: 05 and 06. Screens: design reference
§3.10 and §3.11.

Goal: a maintainable catalog (super admins edit, members read) with price
history, images in R2, and per-product sales analytics.

## 1. Data

- `ProductPrice` rows are appended by `createProduct` and by `updateProduct`
  when `listPrice` changes; `Product.listPrice` is the denormalised current value.
- `ProductImage` uploads reuse the presign/complete pattern from Phase 03 at
  `/api/products/[id]/images/{presign,complete}`; super admin only; PNG, JPG,
  WebP up to 5 MB; key `products/{productId}/{imageId}.{ext}`. `complete`
  downloads the original, makes a 1600px-wide WebP with `sharp`
  (`fit: inside`, quality 82), uploads it to `thumbKey`, and stores sizes.
  `position` = current count; `reorderImages(productId, ids[])` rewrites
  positions in one transaction; `deleteImage` removes both objects.
- Image URLs for display are presigned GETs (10 min) generated server-side in
  the page and passed as props; never expose keys to the client. Cache the
  signed URL per request only.

## 2. Analytics — `src/lib/analytics/products.ts`

`productStats(product, twelveMonthRows, allRows)` → revenue 12m and share,
units 12m and per order, orders 12m and buyer count, price drift (first
month avg billed → last month), sales velocity (units/week over last 8
weeks), attach rate (% of POs in 12m containing it), avg billed vs list,
first/last sold. `priceTrend(rows, listPriceHistory)` → 12 monthly points
with `null` for months without sales (gap, not zero), plus today's list price.
`whoBuysIt(rows)` top 5 buyers by value; `boughtTogether(rows, allRows)` the
five products most often on the same PO with the co-occurrence %.
`needsAttention(products, rows)`: missing image, inactive, not sold 60 d,
price moved > 3%.

**One dataset, one window.** Every KPI on the catalog and on product detail is
derived from the same rows and the same 12-month window as the table, the
footer summary and the order history beneath it. Export the window once —
`twelveMonthWindow(now)` in `src/lib/analytics/products.ts`, KL time, and
pass it to every caller — and never let a second definition appear. Concretely,
the bug to prevent: the order-history table and the stat tiles above it had
drifted to *367 days* and *365 days*, so the tiles and the rows disagreed by a
couple of orders. They must read from one window and one fetch, not two.
Likewise the "x% below list" note is computed from the very average-billed
figure it sits beside (`avgBilled` vs `listPrice`), never from a separately
averaged number.

On the catalog, the KPI row describes **all products**, while the footer
summary describes the **active filter**; each says which it is. With no
filter and no search applied the two must be identical — if they differ, one
of them is reading a different dataset and that is a bug.

## 3. Catalog — `/products`

Per §3.10. `?q=&category=&sort=&view=grid|list&filter=&page=&size=`. The
**"Needs attention" tile's breakdown counts are clickable**: each (Missing
image, Inactive, Not sold in 60 days) sets the matching quick-filter chip in
`?filter=`, and the chip row shows that chip selected, so the tile and the
chips are visibly the same control. A breakdown count of zero is
`ink-disabled` and not clickable. Section eyebrows and column headers are mono
and not uppercased (G3); product names that ellipsise carry a `title` with the
full name (G4). The
grid/list toggle also writes `localStorage["products.view"]` and the page
reads the URL first, then storage, then defaults to grid. `ProductCard` grid
with the flags; list view on `DataTable`. Members see the "View only" pill
and no create/edit affordances; the actions still enforce `requireSuperAdmin`.

## 4. Product detail — `/products/[id]`

Per §3.11. `Gallery` (main + thumbnails, presigned URLs; with no images its
empty state reads **"Add images"** for a super admin and opens the upload
dropzone, and "No images yet" for a member), facts card, six stat tiles,
`PriceTrendChart` (Recharts line with `connectNulls={false}`, `ReferenceLine`
for list price, segmented Avg price / Units), Who buys it (`HBarList`), Bought
together, Order history table (Phase 05 `DataTable` over line items joined to
POs).

The stat tiles and the order history table are fed by the **same 12-month
window and the same fetched rows** (see §2); the page performs one query for
them, not one each. An order-history price cell that differs from that day's
list price keeps the amber highlight and gains a tooltip (and a matching
`title`) naming both numbers — "Billed RM 41.98 · list RM 43.27" — so the
highlight is never colour alone (G2).

`ProductSheet` (super admin): create/edit fields with Zod
(`sku` uppercase alnum and dashes, unique; `listPrice` Decimal string > 0;
`category` from the fixed list in `src/lib/product-categories.ts`; `unit`
free text), Active toggle, Archive (sets `active = false`, keeps history),
and the image grid with drag-to-reorder (`@dnd-kit/sortable`, add the
dependency) and the upload dropzone reusing `useUploadQueue` with the
product presign endpoints.

Product names on PO detail line items and on the review form link to
`/products/[id]` when matched.

## 5. Tests

Vitest for `productStats`, `priceTrend` gaps, `boughtTogether`,
`needsAttention` and the product Zod schema. Manual: upload a 4000px PNG and
confirm the WebP derivative is 1600 wide and under 300 KB.

## 6. Acceptance criteria

1. Catalog KPIs and the quick-filter chips agree with the cards' flags, and
   with no filter or search applied the KPI row and the footer summary show
   the same figures; applying a filter changes only the footer summary.
2. Grid/list preference survives reload and is overridden by the URL.
3. Members cannot see or call any edit action (try the action from devtools; it returns an auth error).
4. Changing a list price appends a `ProductPrice` row and the trend keeps the old value.
5. Image upload, reorder and delete work; the first image is the catalog thumbnail.
6. Price trend leaves gaps for empty months and shows the list reference line.
7. Order history highlights billed prices more than 1% under list, and each
   highlighted cell's tooltip names both numbers ("Billed RM 41.98 · list
   RM 43.27").
8. On product detail, the stat tiles and the order-history rows cover the
   identical 12-month window: the tile's order count equals the number of
   history rows, and the "x% below list" note recomputes to the average billed
   figure printed beside it.
9. Clicking a "Needs attention" breakdown count applies the matching
   quick-filter chip and shows that chip selected; a zero count is not
   clickable.
10. A product with no images shows "Add images" for a super admin and "No
    images yet" for a member.

# Storefront design canvas

Canvas: https://claude.ai/code/artifact/52adbe2d-50aa-441c-b00b-2dc76be12c18

Source of truth for the visuals of the storefront revamp. The implementation
plans are `docs/specs/design/shop/` — `00-overview.md` first, then one file per
phase (17–22).

## Artboards

Page 1 — Storefront
| File | Screen |
| --- | --- |
| `Shop.dc.html` | **The working prototype** — every screen below, plus order history, the purchase order and customer settings |
| `Main.dc.html` | Home / landing |
| `Catalogue.dc.html` | Browse, with filters in a top bar |
| `Product.dc.html` | Product detail |
| `Cart.dc.html` | Cart, as a guest |
| `Checkout.dc.html` | The sign-in gate |
| `ReviewSend.dc.html` | Review & send, signed in |
| `OrderPlaced.dc.html` | Order sent, with the PDF download |
| `Mobile.dc.html` | Home at 390px |

Page 2 — Purchase order & product codes
| File | Screen |
| --- | --- |
| `PurchaseOrderDoc.dc.html` | The generated purchase order (A4, 794×1123) |
| `ProductAliases.dc.html` | Admin → Product codes |

`purchase-order-preview.html` is the PO artboard as a standalone page, for
opening in a browser without the canvas.

`Shop.dc.html` is the only artboard with logic: one `DCLogic` class holding
view, search, filters, sort, the cart, the signed-in flag, order history and
the document list, switching views with `sc-if`. Every money figure is computed
from the line items by `orderTotals`, so the order table, the purchase order
and the settings preview cannot disagree with each other.
Artboards share nothing at runtime, which is why a clickable flow has to live
in a single file rather than link between the static ones.

## Rebuilding

Working files are the `.dc.html` sources plus `canvas.json`. Edit those, re-seed
a fresh copy and republish to the same URL — never edit
`loving-hands-storefront.html`, which is generated.

## Sample data

Prices are **sample values**. Production holds 309 products at RM 0.00 and the
shop lists only `active && !needsReview && listPrice > 0`. Bracketed text
(`[YOUR PHONE NUMBER]`, `[YOUR COMPANY REGISTRATION NO.]`, `[TAX, IF ANY]`) is
for the customer to supply.

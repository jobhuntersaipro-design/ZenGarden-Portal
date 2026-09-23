# z8v9xngdut — permissions matrix

Layout fixture: `PermissionGrid` rendered with the dev server's stylesheet and the seeded default grants. No production session — `.env.local` is not in this environment, so `/admin` cannot be signed into. The fixture route was not committed.

Viewport measurements are from Chromium via Playwright, 23 Sep 2026.

## Vertical stick (1440×900)

Scroller `max-height` computed **576px** (`min(36rem, 100dvh - 12rem)`). `scrollHeight` **1261**, `clientHeight` **576**.

After `scrollTop = 320`:

| | top (px) |
|---|---:|
| Scroller | 223 |
| Action header (`position: sticky`) | 223 |
| "Move an order back a stage" row | 755 |

Header and scroller tops match (difference **0**). The row sits **320px** closer to the header than it did at `scrollTop = 0`, which is the scroll distance.

## Horizontal stick (768×900)

`scrollWidth` **909**, `clientWidth` **638** (271px of horizontal overflow). Page `scrollWidth - clientWidth` is **0** — the page itself does not scroll sideways.

After `scrollLeft = 180`, the Action header's left edge equals the scroller's left edge (**65px**, difference **0**). Role headers move with the scroll. A right-edge fade is present. At 1440×900 the table fits (`scrollWidth` **1030** = `clientWidth` **1030**) and the fade is absent.

## Role filter

Focusing QC leaves the desktop headers as exactly `Action`, `QC`. "Upload a purchase order" is still in the grid. The phone picker is a separate control; at 390 it still switches roles (Warehouse pressed, planner checkboxes not visible).

## Administration

Starts `aria-expanded="false"` on desktop and phone; "Manage users" is not in the document. Expanded, `QC: Manage users` and `Warehouse: Manage users` are `disabled`.

## Save

"Production planner: Edit a purchase order" is enabled. Checking it sets the button to **Save 1 change** and shows Discard. Checking it again returns **Save changes** (disabled) — a toggle back to the server value leaves the dirty set. Discard does the same. Super admin cells stay disabled.

`updatePermissions` was not called against a database. The writer is unchanged and covered by `src/actions/permissions.test.ts`.

## Search

Skipped. A name filter has to decide what a hit inside the closed Administration group does, on both the table and the phone list. The role filter is the density control this cut ships.

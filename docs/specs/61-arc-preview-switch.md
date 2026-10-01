# 61 — Current / Arc: every page, one switch

Asked for on 2026-10-01: "change every component in this page to using the arc
preview … let me see the preview first, then I will decide if we want to keep the
old one or use component from uiarc.dev". Asked which page, the answer was
"every pages, including shop and portal"; asked how to compare, a toggle on the
same URL.

This replaces phases 2–6 of `60-arc-foundation.md` as a preview: the whole app
can be drawn in Arc's parts, and nothing about the current look changes until a
choice is made.

## 1. The switch

- A cookie, `zg-ui` = `classic` | `arc`, read once in the root layout
  (`src/lib/ui-mode-server.ts`), which sets `<html data-ui>` and wraps the app in
  `UiModeProvider`. Every route group — portal, admin, auth, shop — is under it.
- **Current / Arc**, a small segmented control (Arc's own) fixed bottom-left
  above the phone tab bar, bottom-centre from `lg`. It writes the cookie and
  calls `router.refresh()`, so the page re-renders in place with its filters
  and data.
- `?ui=arc` or `?ui=classic` on any URL sets the cookie in the proxy and drops
  the parameter, so a link can open a page in either set.
- **Production never offers it.** `arcPreviewEnabled()` is false when
  `VERCEL_ENV=production` (unless `ARC_PREVIEW=1`), and the resolved mode is
  then always `classic`. Merging this changes nothing the team sees.
- Cookies are host-only, so the shop host and the portal host each keep their
  own choice.

## 2. What changes in Arc mode

The primitives every screen is built from dispatch on `useIsArc()`:

| Ours | Arc |
|---|---|
| `ui/button` | Arc button (pill, spring press, morphing label, `loading`); `asChild` links take Arc's button classes |
| `ui/input`, `ui/textarea` | Arc's field control (our forms keep their own labels) |
| `ui/checkbox`, `ui/switch` | Arc checkbox (44px target, drawn tick), Arc switch |
| `ui/dialog`, `ui/sheet` | Arc dialog and drawer surfaces, overlay and entrance (Arc's keyframe path for a plain Radix root) |
| `ui/popover`, `ui/dropdown-menu`, `ui/tooltip`, `ui/select`, `ui/avatar` | Arc's classes on the same Radix parts |
| toasts (`@/lib/toast`, every caller) | Arc toast stack |
| `SegmentGroup` / `ChoiceButton` | Arc segmented control (sliding selection) and Arc chips |
| `TablePagination` | Arc pagination |
| `StatusBadge`, `StageBadge` | Arc badge |
| `DataTable` | Arc sortable-data-table look (sort buttons, tinted sorted column) |
| KPI figures (`CountUp`) | Arc animated counter (real figure first, digits roll) |
| Sales over time | Arc line chart |
| Share donuts | Arc donut chart |
| `StageStepper` | Arc stepper |
| auth `Notice` | Arc alert |
| breadcrumbs (PO, buyer, product pages; shop product) | Arc breadcrumb |
| shop search, variant pills | Arc search field, Arc chips |
| loading skeletons | Arc's skeleton fill and pulse (`data-shimmer`) |
| native toolbar selects | Arc's field border, radius and focus ring |

Arc's CSS modules now sit in `@layer arc`, between preflight and Tailwind's
utilities (`scripts/arc-import.ts`). Unlayered, Arc's `display`/`width`/
`padding` beat the utilities a caller passes; in the layer, a caller's
`hidden sm:inline-flex` still hides the button.

## 3. Not in Arc yet, in either mode the same

The sidebar and phone tab bar, the welcome card, the Demand Board's committed
table and stage chart, the trend card's multi-series chart, the shop's header,
category strip, product cards and carton stepper fields, the admin tabs, user
table and permission grid. Arc has no direct twin for most (no sidebar, no
stacked bar chart), and the rest are hand-built screens that take Arc's look
only once rebuilt one by one, if Arc is chosen.

Known differences in Arc mode, worth seeing before choosing:
- The sales chart loses its printed figures and the min/max markers; Arc's
  crosshair readout replaces them.
- The donuts' legend rows are Arc's own and no longer link to each buyer or
  product.
- Arc's loading button hides its label behind the spinner.
- Arc's dialog is 440px unless a caller asked for wider.

## 4. Verified

Production build, local Postgres with the seed, signed in as a super admin and as
a shop contact, both modes.
- No page overflow on 16 portal and admin pages and 5 shop pages, at 1440 and
  390, in either mode.
- The sub-44px controls at 390 are the same set in both modes (the Demand
  Board's 24px row carets, file inputs, the admin grid's checkboxes); Arc mode
  has fewer on the shop (its search button is 44px) and on `/products/new`.
- Drawer, dialog, account menu and toast open and read in Arc at both widths.
- **Found while driving:** the switch at bottom-left covered the sidebar's
  account menu at 1440, so a click on it landed on the switch. It sits
  bottom-centre from `lg` now.
- Tests: the switch (6), the CSS layer (2), the mode resolver (3); the button
  test watched failing with Arc ignored.

## 5. Not verified

The Vercel preview itself; Safari, Firefox, a real phone, a screen reader.

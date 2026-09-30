# 60 — Rebuilding the portal on Arc

Asked for on 2026-09-30: "Explore deeply how can I use https://uiarc.dev/ for
portal design / I want to utilize every component in uiarc / Help me rebuild
it / Also, let me preview it before merge to main".

Four decisions were the user's:

- **Arc's parts, our look.** The ClickUp tokens and the canvas stay the source of
  truth. Arc's variables are pointed at our tokens; Arc's own palette, fonts and
  radii are not adopted.
- **Every part with a job here**: 73 registry items. The ones left out are in §3
  with the reason.
- **Previewed on a Vercel preview deployment, look only.** Preview deployments
  read and write the production database (current-feature, Phase 41 notes), so
  a preview is for looking at, never for placing or confirming orders.
- **In phases, each previewed.** `main` moves only when the user approves a
  phase.

| Phase | What changes | Preview |
|---|---|---|
| 1 | Foundation: dependency, import script, token map, `/admin/arc` gallery | `/admin/arc` |
| 2 | Dashboard and Demand Board | `/`, `/demand` |
| 3 | Purchase orders, review, upload | `/purchase-orders`, `/review/[id]`, `/upload` |
| 4 | Buyers, products, stock | `/buyers`, `/products`, `/stock` |
| 5 | Shop | the shop host |
| 6 | Admin and auth | `/admin/*`, `/signin` |

## 1. How Arc gets in

Arc is a shadcn-style registry (`https://uiarc.dev/r/{name}.json`). Its source
is `github.com/kuratlielia/arc-library` (MIT). uiarc.dev itself is blocked by
this environment's egress, and GitHub raw is not, so `scripts/arc-import.ts`
reads the registry JSON from GitHub, pinned at **`cde1b40`**, and writes
`src/components/arc/`. On the way in:

- **`foundation.css` is not copied.** It ends with
  `:is(*:focus, *:focus-visible, *:focus-within) { outline: none !important }`
  and sets `--focus-ring: transparent`. That is no keyboard focus anywhere in
  the app, and it is not something a token can undo.
- **Every foundation token is renamed `--x` → `--arc-x`** (90 of them). Arc's
  names include `--background`, `--foreground`, `--accent` and `--border`,
  which shadcn's `:root` already sets, `--text-sm`, which is Tailwind's, and
  `--font-display`, which is ours. Left alone, Arc would either repaint shadcn
  or be repainted by it.
- **`src/app/arc-tokens.css`** defines the `--arc-*` set from the `@theme`
  tokens: ink accent (the dark pill), `--color-focus` for the ring,
  indigo-tinted shadows, Plus Jakarta Sans over Inter, 44px controls, the share
  palette for chart series, 9px inputs and the 20px button pill.
- **`@radix-ui/react-*` imports become `radix-ui`**, the package this project
  already depends on, so Arc and shadcn share one Radix.
- **Patches are listed in the script** (`PATCHES`), each with its reason. There
  is one: buttons take `--arc-radius-button`, because ClickUp buttons are the
  20px pill and inputs are 9px, where Arc gives both one radius.

The output is overwritten on every run. Change the script or the token map,
never a vendored file.

**New dependency:** `motion` 13 (Arc animates with it; 117 of the 121 items
import it). No new Radix packages.

## 2. Deliberate departures from this project's rules

- **CSS modules.** `context/coding-standard.md` says Tailwind for all styling.
  Arc is written in CSS modules and is vendored rather than rewritten; the
  modules read only `--arc-*` variables, and those read only our tokens. Code
  we write around Arc stays Tailwind.
- **Vendored code is not ours to edit.** It is linted and typechecked with the
  rest (both clean at import), but a fix goes in the script's `PATCHES` or in
  `arc-tokens.css`.

## 3. Left out, and why

| Item | Why |
|---|---|
| theme-switch, -eclipse, -split, -rise | The portal is light only |
| context-menu | A right-click menu has no touch equivalent; row menus use dropdown-menu |
| hold-to-confirm | Deletes type the reference back (Phase 43); a hold is a second rule for the same job |
| tag-input, mention-input | No tags, no mentions |
| shortcut-recorder | No user-defined shortcuts |
| billing-toggle, plan-comparison | No billing |
| slider | No continuous value to choose |
| time-picker | Dates only; the business works by the day |
| color-picker | No user-chosen colours |
| rich-text-editor | Notes are plain text |
| signature-pad | Signature lines were removed from the PO (Phase 42) |
| expandable-card | accordion and Reveal already cover it |
| announcement-bar, logo-marquee, hero-section, cta-section, faq-section, blog-grid, stats-band, contact-section, newsletter-signup, site-header, site-footer, comparison-table | Marketing pages |
| usage-meter | No quotas |
| streamgraph, brush-chart, waffle-chart, ridgeline, treemap | No question here they answer better than the charts kept |
| code-block | No code shown to users |
| comment-thread, chat-thread | Notes are a feed, not a conversation |
| image-compare | Nothing to compare |
| text-reveal, in-view-title, slot-text | Marketing motion |
| sign-in, login-centered, otp-input | Sign-in is password + Google, no one-time codes |
| signup-form | Accounts are invited, never self-registered |
| changelog-feed | Needs `@halden/node`; no changelog |

## 4. Phase 1 — what ships

- `motion` in `package.json`.
- `scripts/arc-import.ts` and its test; `src/components/arc/` (171 files, 73
  items, the MIT licence, `tokens.json`).
- `src/app/arc-tokens.css`, imported by `globals.css`, and its test, which fails
  if a vendored part reads a token the map does not define, if the focus ring
  goes transparent, or if a raw colour enters the map.
- `/admin/arc`, super admin only, the "Arc preview" tab: every part with the job
  it will do and the phase that ships it, on static data.

No real screen changes in phase 1.

## 5. The gate each part passes before it reaches a real screen

Measured on `/admin/arc` on 2026-09-30, at 390 (touch) and 1440 (keyboard).
Phase 1 ships these parts on a preview page only; a later phase that puts a
part on a real screen fixes what is listed for it first, through `PATCHES` or
the token map, and measures it again.

**Already fixed in phase 1**

- **Focus ring.** `--arc-focus-ring` is `--color-focus`; Arc ships
  `transparent`.
- **44px below `sm` for everything that reads `--arc-control-height-sm`**: tabs,
  pagination, chips, segments, menu rows, the sm button. Measured 44px at 390
  and 36px at 1440.
- **Screen-reader tables in the line, bar and donut charts** pushed a 390 page
  to 436. They are now wrapped in a clipped div; the page reads 390.
- **Server and browser disagree on Arc's dates.** The calendar and the range
  picker print dates through `Intl`, and Node's ICU and Chrome's differ
  ("Thursday 10 December" against "Thursday, 10 December", "1–30" against
  "1 – 30"). That is a hydration mismatch on every load. On the preview both
  mount after hydration (`useHydrated`); a real screen does the same, or
  formats through `src/lib/dates.ts`.

**Still open, per part**

- **Fixed-size icon buttons under 44px at 390**: alert dismiss 28, toast close
  32, toast-stack close 28, dialog and drawer close 32, bottom-sheet close 32,
  password-field reveal 30, password-strength reveal 34, search-field clear
  24, combobox and multi-select clear 22, phone-input clear 24, inline-edit
  save and cancel 28, swipe-actions ⋯ 32, calendar arrows 32 and days 35,
  stepper markers 28, filter-toolbar chip remove 24, file-dropzone and
  file-upload remove 26–32, carousel dots 16 wide, sortable-data-table sort
  headers 32 and select-all 28, tree-view rows 36, line-chart legend 32,
  donut legend rows 40, user-menu trigger 40, notification bell 42,
  empty-states tabs 30. The breadcrumb, hover-card and tooltip triggers are
  text links, the accepted class.
- **Focus that shows too faintly or not at all**, from reading the source and
  from focusing each control: chip-group (no focus rule), confirm-morph (a
  6–9% tint), number-field and phone-input (border colour only),
  command-palette's search (row tint only), date-range-picker (5–7% tint),
  swipe-actions' revealed actions, card's quick-look panel, bottom-sheet and
  hover-card surfaces, line-chart and slope-chart plots, empty-states and
  page-header (browser default only).
- **Blocks that are Arc's demos, not components.** `page-header` and
  `empty-states` take no props: they render Arc's own "Northline" project and
  four fixed scenes. Phase 2 builds ours from Arc's parts (breadcrumb, tabs,
  button, avatar-group) rather than using the block.
- **metric-card** takes a plain number: no RM, no decimals, and it counts up
  from zero, so its first paint reads "000,000". 00-master §4 says a KPI never
  renders zero on first paint. Phase 2 uses `animated-counter` (which takes a
  prefix and decimals) inside our own tile, starting from the real figure.
- **bar-chart cannot stack**, so the order-stage board keeps its Recharts
  chart unless Arc gains series.
- **phone-input has no Malaysia (+60)** in its country list. The import script
  adds it before phase 4.
- **badge** has five tones, not our status palette; phase 3 maps each status
  onto one or keeps `StatusBadge`.
- **Heading order**: `page-header` and `empty-states` render their own `h2`.
- **password-strength** defaults to a 12-character rule; the portal's own rule
  is what it must show (phase 6).

## 6. Phase 1 — verified

Local Postgres 16 and the project's seed, dev server, a promoted super admin.
- `/admin/arc` answers 200 with **73 specimens**, no page overflow at 1440 and
  390, and **no hydration error** (after the two fixes above). The only failed
  requests are Vercel's speed-insights script, blocked by this container.
- Computed at 390: `--arc-focus-ring` `#7612fa`, `--arc-accent` `#292d34`,
  `--arc-font-body` Inter, `--arc-control-height-sm` 44px (36px at 1440).
- Every chart drawn with the share palette once its entrance finished (a
  screenshot at 1.2s catches lines mid-draw and the gauge at 0%).
- `tsc` and lint clean over all 171 vendored files as imported.

**Not verified:** the Vercel preview itself (built from the pushed branch; the
user opens it), Safari and Firefox, a real phone, a screen reader.

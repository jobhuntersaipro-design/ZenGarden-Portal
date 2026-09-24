# Lessons

Defects that were shipped, found by the user, and are worth not repeating.
Short on purpose: each entry is a **rule** first, then the one case that
earned it. `context/current-feature.md` holds the full measured record; this
file exists so the rule is read before the next screen is built, not after.

---

## 1. One subject, every dependent figure

**Rule.** When an interaction changes *what a screen is about* — a hovered
bar, a pinned bucket, a selected row, a chosen date — every figure derived
from that subject must be recomputed from it. Before shipping, list
everything on screen that reads the subject and follow each one. A figure the
server computed once, at a fixed instant, does not announce itself as stale:
it renders under the new heading and reads as the new subject's own.

**Smell.** A component takes both a *server figure* (`breakdown`,
`orderCount`, `totals`) and an *active selection* (`activeKey`, `hovered`,
`selected`). Every server figure beside a selection is a candidate.

**The case (2026-09-22, reported by the user).** On the Demand Board's stage
chart, pinning a bar moved the chart, the table heading and the table — but
not the legend between them, which rendered `breakdown`, computed once at
`now`. A bar reading **24** sat above five legend rows summing to today's
**26**. Every other consumer had been converted; the legend was missed
because it looked like chrome rather than a figure.

**What makes it worse.** The whole board had just been rebuilt to remove this
exact class — bars showing one moment's figures under another moment's label.
When you fix a "this figure is from the wrong moment" defect, **sweep every
sibling that reads the same source in the same file**; one left behind
reintroduces the defect one component lower, where it is harder to see.

**The fix shape.** Derive it from what the chart already drew
(`pointBreakdown(point)`) rather than fetching or recomputing. If the series
carries the numbers, the legend must read them from the series — then the
bar and its legend *cannot* disagree, rather than merely happening to agree.

---

## 4. `1fr` inside `overflow-hidden` clips the whole track

**Rule.** A grid track written `1fr` is `minmax(auto, 1fr)`. Its minimum is
the widest thing in it that cannot shrink. If that track sits in a card with
`overflow-hidden`, the card clips every line in the track at the same edge —
a title that looks like it should wrap, and a price that breaks mid-glyph.
Size the text track with `minmax(0, 1fr)`, and do not put a control row that
cannot shrink into the text column. A horizontal scroller with no edge cue
has the same shape: a label cut at the box edge reads as broken, not as
"there is more". Fade the side that still has content.

**The case (2026-09-23).** On the shop cart at 390px the line's stepper,
amount and remove sat in the title's column. The stepper's 160px minimum
widened that column past the card, so "Test Hand Wash 500ML — Lavender" and
"RM 198.00" were both cut by the card. The category chips scrolled, and
"Hair & body care" was cut at the screen edge with only a thin scrollbar to
say so.

---

## 2. A link must be able to express what it counts

**Rule.** Before linking a figure to a filtered list, check the list can
express the same population. If it cannot, print plain text. A link that
silently answers a *different* question is worse than no link.

**The case, twice over, same screen.**

- The legend's rows linked to `/purchase-orders?...&stage=X`. That list
  filters the `stage` **column**, which holds today's stage and no history —
  so it can say "at QC passed now" and can never say "at QC passed on
  17 Sep". While a day is pinned the rows are now plain text.
- The same href carried the chart's `from`/`to`. But the board counts every
  order open *during* the window whatever its `poDate`, so the date range
  excluded exactly the orders open longest. **Measured:** with one open
  QC-passed order dated 10 Jun, the legend read **8** and the link returned
  **7**.

**Smell.** A query's `where` stopped being a date range (or changed
population in any way) and an href built from the old bounds was left behind.
**Changing what a query selects is a change to every link built from it.**

---

## 3. A static render cannot see an interactive defect

**Rule.** `renderToStaticMarkup` only ever shows the at-rest state, which is
usually the state that was already right. A defect that appears *after* a
click needs either a real browser or the logic pulled out into a pure
function a test can call with the post-click argument.

**The case.** `pointBreakdown` was extracted precisely so the rule above
could be tested: its guard asserts every bar's legend equals the breakdown at
that bar's own instant, on a fixture whose first and last day deliberately
differ. Expressed as the defect — every bar read from the last snapshot — it
goes red. A fixture where the days agree would have passed under both.

---

## 5. Settle a route bar when the skeleton leaves

**Rule.** A same-path link is a refresh of the screen already up. Sending it
through a normal `<Link>` lets `loading.tsx` replace that screen. A route
progress bar finishes when that route's loading skeleton unmounts, not when
the URL changes. The URL moves as soon as the skeleton is allowed on screen,
which is before the page data arrives.

**The case (2026-09-23).** On the preview, Purchase orders, Buyers and
Products raised the shared bar 27–35ms after the click. Settings painted
`Loading…` with the bar still on. Sorting Purchase orders kept the heading
and showed Updating…. Under reduced motion the bar's fill stopped sliding
and sat at full width, and `.animate-in` / `.animate-rise` computed to
`animation-name: none`.

---

## 6. The route bar starts when the router starts

**Rule.** Turn the route bar on from the navigation Next actually begins
(`onRouterTransitionStart`), and resolve the click's anchor from
`composedPath` before `closest`. Keep that state on one `globalThis` slot:
the instrumentation entry and the shell are separate bundles, and a begin
in one copy never reaches a bar subscribed in the other. Do not clear the
bar on a URL commit that has no skeleton yet. A skeleton mounting later
only increments depth — it cannot turn the bar back on — so that commit
waits a short grace, cancelled when the skeleton mounts.

**The case (2026-09-23).** On www, Products → Buyers → Stock under Slow 3G
left `data-route-progress="off"` for the whole soft-nav. The same build's
shop header links raised the bar during the click. The portal node was
mounted the entire time; it never flipped to on.

---

## 7. A column that does not fit is dropped, not cut

**Rule.** A nowrap table is as wide as its columns. When that is wider than
the card, drop the columns that do not identify the row until the card can
hold the rest. What is still off-screen scrolls *inside* the card, the
identifier stays pinned, and the edge that has more fades. A fade painted
`from-canvas` on a white cell is invisible — use a token that is not the
cell's own background. A header cut at the card edge is not a column. The
width that matters is the card's, not the viewport's: `@md` in this project
is Tailwind's 28rem container scale, not a 768px screen.

**The case (2026-09-23).** Purchase orders filtered to Failed, at 1280 with
the sidebar. Twelve columns measured 1159px in a 958px card. Source was the
column under the edge and Uploaded by, Confirmed by and the row action sat
past a horizontal scrollbar. An uncapped file name in Order ID makes that
worse by the length of the name.

---

## 8. A label you derive is not an identifier

**Rule.** Shortening a name to make a mark — initials, a monogram, a slug, an
abbreviation, a colour picked from a hash — throws information away, and two
different things can land on the same output. Before shipping one, run the
derivation over **the whole real list** and count the distinct results. If it
is fewer than the inputs, the mark identifies nothing. Where the list can
grow at runtime, the check has to cover the shape of future values too, and
the fallback has to be a value, never a blank.

**Smell.** A function that takes a name and returns 1–3 characters, with no
test that feeds it every name the product actually holds. `slice(0, 2)`,
`split(" ")[0]`, "first letter of each word".

**The case (2026-09-23, reported by the user).** The shop's category tiles
printed the first two letters of a category's first word. Three of the nine
seeded categories reduce to `HA` — Hand wash & soap, Hair care, Hand
sanitizer — and production's own labels drew **two identical `HA` circles side
by side** on the home page. Nine categories, six marks. The code was four
lines long, carried a careful comment about *why* it differed from the
person-name `initials()`, and had no test over the category list.

**What makes it worse.** The same file already had the counter-example in it:
the comment explained that `initials()` would turn "Shower cream & gel" into
`SC`, so a second rule was written — and the new rule was never run over the
list either. **Reasoning about one input is not checking the set.**

**The fix shape.** Identify by something that cannot collapse: a shape, an
image, the full name. Where a derived mark is genuinely wanted, pin it with a
test that asserts `new Set(list.map(derive)).size === list.length` over the
real list, and watch it fail against the old rule — the guard that replaced
this one reports `expected 'HA' not to be 'HA'`.

---

## 9. An escape hatch is not a fix — it leaves the defect in every caller that does not use it

**Rule.** When a component misbehaves in one configuration and the answer is a
prop that turns the behaviour off, the defect is still there: it is now
conditional on a caller remembering to pass the prop. Before shipping a
`disableX` / `showY={false}` switch, list every caller and check what the
**default** does to each one. If the default is the broken configuration, you
have moved the defect, not removed it. Prefer a rule that is correct in all
configurations, so no caller has to know.

**Smell.** A boolean prop whose doc comment explains a defect (`"…they
collide, so a caller drawing more than one turns them off"`), and a default
value on the side of the defect. Also: one caller passing it and another not.

**The case (2026-09-24, reported by the user).** `SeriesTrend`'s value labels
overlapped across series, so `labelPoints` was added and the dashboard passed
`selected === 1`. The buyer page's `ProductTrend` never passed it, so it kept
the `true` default and shipped the collision: **28 figures over 18 x positions
with 9 overlapping pairs** on `/buyers/[id]`, live, for two days. The
dashboard meanwhile printed no figures at all — which is what the user
reported, and the only reason anyone looked.

**What makes it worse.** Both symptoms were the same missing rule, so the
report ("show the labels") and the hidden defect ("the labels are unreadable")
had one fix. Reading the switch as a *setting* rather than as *evidence of an
unsolved problem* is what kept it open.

**The fix shape.** Solve it once, where both callers read it, and delete the
prop so the question cannot be answered two ways again — then make the
single-series path the one-series case of the general rule, so the charts that
never had the problem cannot drift away from the charts that did.

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

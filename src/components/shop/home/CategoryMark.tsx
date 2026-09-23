/**
 * A drawn mark per kind of product, and the reason the category tiles stopped
 * using letters.
 *
 * `CategoryGrid` used to print the first two letters of a category's first
 * word, which is not an identifier: of the nine seeded categories, **three**
 * collide on `HA` — Hand wash & soap, Hair care and Hand sanitizer — and
 * production's own labels put two identical `HA` tiles side by side on the
 * home page. A shape can tell those apart and two letters cannot.
 *
 * Matched on keywords rather than on the exact names, because a category is a
 * growing `CatalogLabel` (Phase 28), not a closed list: production says
 * "Hair & body care" and "Dishwash" where the seed says "Hair care" and
 * "Dishwash & cleanser", and tomorrow's label is nobody's to predict. An
 * unmatched label gets the generic bottle rather than nothing, so a new
 * category is plain rather than broken.
 *
 * Order matters where a label carries two keywords: "Hair & body care" holds
 * both `hair` and `body`, and reads as hair care, so `hair` is tested first.
 * `sanitiz` is tested on its own stem so "Hand sanitizer" cannot be caught by
 * the `hand wash` rule.
 */

type MarkId =
  | "shower"
  | "handwash"
  | "hair"
  | "body"
  | "sanitizer"
  | "dishwash"
  | "laundry"
  | "fragrance"
  | "generic";

/** Exported for the test that pins the collision this component exists to fix. */
export function categoryMarkId(name: string): MarkId {
  const label = name.trim().toLowerCase();
  if (label.includes("sanitiz")) return "sanitizer";
  if (label.includes("hair")) return "hair";
  if (label.includes("shower")) return "shower";
  if (label.includes("hand") || label.includes("soap")) return "handwash";
  if (label.includes("dish")) return "dishwash";
  if (label.includes("laundry") || label.includes("detergent")) return "laundry";
  if (label.includes("fragrance") || label.includes("perfume")) return "fragrance";
  if (label.includes("body")) return "body";
  return "generic";
}

/** One 34 × 46 outline each, drawn on the same grid so a row of them lines up. */
const MARKS: Record<MarkId, React.ReactNode> = {
  shower: (
    <>
      <rect x="13" y="1" width="8" height="6" rx="1" />
      <path d="M12 7h10l5 6v30a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V13z" />
      <path d="M7 19h20M7 32h20" />
    </>
  ),
  handwash: (
    <>
      <path d="M17 1v4" />
      <path d="M13 5h8v4l4 5v29a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V14z" />
      <path d="M9 21h16M9 33h16" />
    </>
  ),
  hair: (
    <>
      {/* Flip-top: a wide flat cap on square shoulders. */}
      <path d="M10 1h14v4H10z" />
      <path d="M9 5h16v36a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3z" />
      <path d="M9 18h16M9 31h16" />
    </>
  ),
  body: (
    <>
      <path d="M13 1h8v5h-8z" />
      <path d="M9 6h16v34a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3z" />
      <path d="M9 20h16M9 31h16" />
    </>
  ),
  sanitizer: (
    <>
      {/* The pump: a stem up and a nozzle folded out to the side. */}
      <path d="M17 8V3h7" />
      <path d="M13 8h8l3 5v28a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3V13z" />
      <path d="M10 24h14" />
    </>
  ),
  dishwash: (
    <>
      <path d="M14 2h6v4h-6z" />
      <path d="M7 6h20l-2 36a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3z" />
      <path d="M8 19h18M8 32h18" />
    </>
  ),
  laundry: (
    <>
      <path d="M23 3h6v6h-6z" />
      <path d="M5 9h19a3 3 0 0 1 3 3v29a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" />
      <path d="M24 19h5v10h-5" />
      <path d="M5 20h19M5 32h19" />
    </>
  ),
  fragrance: (
    <>
      {/* Squat body, short neck, and the atomiser bulb off one shoulder. */}
      <path d="M14 4h6v6h-6z" />
      <path d="M9 10h16v27a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3z" />
      <path d="M25 13h3a3 3 0 0 1 0 6h-3" />
      <path d="M9 24h16" />
    </>
  ),
  generic: (
    <>
      {/* Deliberately the plainest of the set — a plain bottle with one band,
          so an unrecognised label reads as unspecified rather than as one of
          the kinds above it. */}
      <path d="M14 1h6v5h-6z" />
      <path d="M11 6h12v35a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3z" />
      <path d="M11 19h12" />
    </>
  ),
};

/**
 * Decorative: the tile's own text names the category, so a second reading of
 * the same name is noise to a screen reader.
 */
export function CategoryMark({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 34 46"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden
      className="h-20 w-auto text-ink-secondary"
    >
      {MARKS[categoryMarkId(name)]}
    </svg>
  );
}

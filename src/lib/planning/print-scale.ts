/**
 * Fitting a board that scrolls sideways onto a page that does not.
 *
 * Kept apart from `PrintBoard` for the reason `grain.ts` is kept apart from
 * the demand query: the component is `"use client"`, and the arithmetic is
 * the part worth testing without a DOM around it.
 */

/**
 * The width a landscape A4 page leaves for content, in CSS pixels.
 *
 * 297mm less the 12mm margins `@page` sets on each side is 273mm, and a CSS
 * pixel is 1/96in, so 273 / 25.4 × 96 ≈ 1032. Derived from the browser's own
 * print geometry rather than guessed, which is what makes the scale land on
 * the page rather than near it.
 */
export const PRINT_PAGE_WIDTH_PX = 1032;

/**
 * What to set `zoom` to so a board `width` pixels wide fits the page, or
 * `null` where it already does.
 *
 * **Only ever shrinks.** A narrow board — three months, say — prints at its
 * own size; blowing it up to fill the sheet would make a four-column board
 * look like a different document from a twelve-column one. `null` rather
 * than `1` so the caller clears the property instead of pinning it, leaving
 * the page's own styling to decide.
 *
 * A width of zero means nothing was measured — an element not laid out yet,
 * or one that is `display: none` — and scaling on that reading would divide
 * by zero and blank the page.
 */
export function printScale(
  width: number,
  pageWidth: number = PRINT_PAGE_WIDTH_PX,
): number | null {
  if (!Number.isFinite(width) || width <= 0) return null;
  return width > pageWidth ? pageWidth / width : null;
}

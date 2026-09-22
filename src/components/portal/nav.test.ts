import { describe, expect, it } from "vitest";
import { NAV } from "@/components/portal/nav";

/**
 * A destination's name is Title Case (00-master.md §4) — the exception to the
 * portal's sentence-case rule, because a nav row is a proper name for a place
 * rather than a sentence about one. Pinned here because it is the kind of
 * thing a later edit lower-cases back without meaning to, and because "Demand
 * board" beside "Purchase Orders" is exactly what was reported.
 */
describe("the portal's destinations", () => {
  const titleCased = (label: string) =>
    label.split(" ").every((word) => /^[A-Z]/.test(word));

  it("names every destination in Title Case", () => {
    for (const { label } of NAV) {
      expect(label, label).toBe(
        label
          .split(" ")
          .map((word) => word[0].toUpperCase() + word.slice(1))
          .join(" "),
      );
      expect(titleCased(label), label).toBe(true);
    }
  });

  it("reads the way the sidebar reads", () => {
    expect(NAV.map((entry) => entry.label)).toEqual([
      "Dashboard",
      "Purchase Orders",
      "Demand Board",
      "Buyers",
      "Products",
      "Stock",
    ]);
  });

  /**
   * The phone tab bar is six tabs at ~65px. A two-word label wraps to two
   * lines there, which is why `short` exists — and why it has to stay one
   * word for the two labels that are not.
   */
  it("gives the phone bar a one-word label for every destination", () => {
    for (const { short } of NAV) {
      expect(short.includes(" "), short).toBe(false);
    }
  });
});

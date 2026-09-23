import { describe, expect, it } from "vitest";
import { NAV, TAB_BAR_COLUMNS, navFor } from "@/components/portal/nav";
import { PERMISSION_ACTIONS } from "@/lib/permissions/actions";

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

/**
 * A nav row the reader may not open is worse than no row: they click it and
 * get a 404. Until 2026-09-23 the list was flat and unfiltered, which did not
 * matter only because no page checked a view key either.
 */
describe("what a role may open", () => {
  const keys = new Set(PERMISSION_ACTIONS.map((action) => action.key));

  it("gives every destination a key the grid actually has a row for", () => {
    for (const { href, permission } of NAV) {
      expect(keys.has(permission), `${href} → ${permission}`).toBe(true);
    }
  });

  it("keeps only the destinations the role holds, in nav order", () => {
    expect(navFor(["/products", "/"]).map((entry) => entry.href)).toEqual([
      "/",
      "/products",
    ]);
  });

  it("drops the whole nav for a role that holds nothing", () => {
    expect(navFor([])).toEqual([]);
  });

  /**
   * The tab bar's column count has to be a literal class — Tailwind compiles
   * what it can see, so `grid-cols-${n}` is not a class at all. Every count
   * the filter can produce therefore needs one spelled out.
   */
  it("has a literal column class for every width the bar can be", () => {
    for (let count = 1; count <= NAV.length; count++) {
      expect(TAB_BAR_COLUMNS[count], `${count} tabs`).toBe(`grid-cols-${count}`);
    }
  });
});

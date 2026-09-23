import { describe, expect, it } from "vitest";
import { classifyAnchorNavigation, reduceRouteProgress } from "./route-progress";

const current = "https://shop.lovinghandsportal.com/products?page=1";

describe("classifyAnchorNavigation", () => {
  it("refreshes a same-path query change and keeps the path the router can replace", () => {
    expect(
      classifyAnchorNavigation({
        href: "https://shop.lovinghandsportal.com/products?category=Soap",
        current,
        target: null,
        download: false,
        modified: false,
      }),
    ).toEqual({ kind: "refresh", href: "/products?category=Soap" });
  });

  it("treats a different path as a route", () => {
    expect(
      classifyAnchorNavigation({
        href: "https://shop.lovinghandsportal.com/cart",
        current,
        target: null,
        download: false,
        modified: false,
      }),
    ).toEqual({ kind: "route" });
  });

  it("ignores a click that does not move, a new tab, a download, and another site", () => {
    expect(
      classifyAnchorNavigation({
        href: current,
        current,
        target: null,
        download: false,
        modified: false,
      }),
    ).toEqual({ kind: "ignore" });
    expect(
      classifyAnchorNavigation({
        href: "https://shop.lovinghandsportal.com/cart",
        current,
        target: "_blank",
        download: false,
        modified: false,
      }),
    ).toEqual({ kind: "ignore" });
    expect(
      classifyAnchorNavigation({
        href: "https://shop.lovinghandsportal.com/cart",
        current,
        target: null,
        download: true,
        modified: true,
      }),
    ).toEqual({ kind: "ignore" });
    expect(
      classifyAnchorNavigation({
        href: "https://example.com/cart",
        current,
        target: null,
        download: false,
        modified: false,
      }),
    ).toEqual({ kind: "ignore" });
  });
});

describe("reduceRouteProgress", () => {
  it("stays on through the skeleton and clears once the skeleton has gone", () => {
    let state = { depth: 0, route: false };
    state = reduceRouteProgress(state, "begin");
    expect(state).toEqual({ depth: 0, route: true });
    state = reduceRouteProgress(state, "mount");
    state = reduceRouteProgress(state, "location");
    expect(state).toEqual({ depth: 1, route: true });
    state = reduceRouteProgress(state, "unmount");
    state = reduceRouteProgress(state, "flush");
    expect(state).toEqual({ depth: 0, route: false });
  });

  it("clears on the URL change when the destination had no skeleton", () => {
    const started = reduceRouteProgress({ depth: 0, route: false }, "begin");
    expect(reduceRouteProgress(started, "location")).toEqual({ depth: 0, route: false });
  });

  it("does not clear when a strict-mode remount lands before the unmount flush", () => {
    let state = reduceRouteProgress({ depth: 0, route: true }, "mount");
    state = reduceRouteProgress(state, "unmount");
    state = reduceRouteProgress(state, "mount");
    state = reduceRouteProgress(state, "flush");
    expect(state).toEqual({ depth: 1, route: true });
  });
});

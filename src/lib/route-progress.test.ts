import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginClientRoute,
  beginRouteProgress,
  classifyAnchorNavigation,
  decideAnchorClick,
  noteRouteLocation,
  noteRouteSkeleton,
  reduceRouteProgress,
  resetRouteProgressForTests,
  ROUTE_SKELETON_GRACE_MS,
  subscribeRouteProgress,
  type AnchorClickLike,
} from "./route-progress";

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

const portal = "https://www.lovinghandsportal.com";

function click(partial: Partial<AnchorClickLike> & Pick<AnchorClickLike, "target">): AnchorClickLike {
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    composedPath: () => [],
    ...partial,
  };
}

function anchor(href: string) {
  return {
    tagName: "A",
    href,
    getAttribute: () => null,
    hasAttribute: () => false,
  };
}

describe("decideAnchorClick", () => {
  it("treats a portal list link as a route when the hit target has no closest", () => {
    const link = anchor(`${portal}/stock`);
    const icon = { tagName: "svg" };
    expect(
      decideAnchorClick(
        click({
          target: icon as unknown as EventTarget,
          composedPath: () => [icon, link] as unknown as EventTarget[],
        }),
        `${portal}/products`,
      ),
    ).toEqual({ kind: "route" });
  });

  it("still routes when the click event has no button", () => {
    const link = anchor(`${portal}/buyers`);
    expect(
      decideAnchorClick(
        click({
          button: undefined,
          target: link as unknown as EventTarget,
          composedPath: () => [link] as unknown as EventTarget[],
        }),
        `${portal}/products`,
      ),
    ).toEqual({ kind: "route" });
  });

  it("ignores a click the browser has already claimed", () => {
    const link = anchor(`${portal}/stock`);
    expect(
      decideAnchorClick(
        click({
          defaultPrevented: true,
          target: link as unknown as EventTarget,
          composedPath: () => [link] as unknown as EventTarget[],
        }),
        `${portal}/products`,
      ),
    ).toEqual({ kind: "ignore" });
  });

  it("falls back to closest when the path is empty", () => {
    const link = anchor(`${portal}/demand`);
    const target = {
      closest: (selector: string) => (selector === "a" ? link : null),
    };
    expect(
      decideAnchorClick(
        click({
          target: target as unknown as EventTarget,
          composedPath: () => [],
        }),
        `${portal}/products`,
      ),
    ).toEqual({ kind: "route" });
  });
});

describe("beginClientRoute", () => {
  beforeEach(() => {
    resetRouteProgressForTests();
  });

  it("starts the bar for an ops list route and leaves a same-path query alone", () => {
    let route = false;
    const stop = subscribeRouteProgress((value) => {
      route = value;
    });
    expect(route).toBe(false);

    beginClientRoute("/buyers", `${portal}/products`);
    expect(route).toBe(true);

    beginClientRoute("/products?page=2", `${portal}/products`);
    expect(route).toBe(true);

    resetRouteProgressForTests();
    route = false;
    const stopAgain = subscribeRouteProgress((value) => {
      route = value;
    });
    beginClientRoute("/products?page=2", `${portal}/products`);
    expect(route).toBe(false);
    stop();
    stopAgain();
  });

  it("keeps the bar on the shared global slot", () => {
    beginRouteProgress();
    const shared = (globalThis as { __zgRouteProgress?: { state: { route: boolean } } })
      .__zgRouteProgress;
    expect(shared?.state.route).toBe(true);
  });
});

describe("route progress grace", () => {
  beforeEach(() => {
    resetRouteProgressForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetRouteProgressForTests();
  });

  function watch(): { route: () => boolean; stop: () => void } {
    let route = false;
    const stop = subscribeRouteProgress((value) => {
      route = value;
    });
    return { route: () => route, stop };
  }

  it("does not clear on the URL until the grace, then clears when no skeleton mounts", () => {
    const bar = watch();
    beginRouteProgress();
    noteRouteLocation();
    vi.advanceTimersByTime(ROUTE_SKELETON_GRACE_MS - 1);
    expect(bar.route()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(bar.route()).toBe(false);
    bar.stop();
  });

  it("keeps the bar when a skeleton mounts during the grace and clears when it leaves", async () => {
    const bar = watch();
    beginRouteProgress();
    noteRouteLocation();
    vi.advanceTimersByTime(ROUTE_SKELETON_GRACE_MS / 2);
    noteRouteSkeleton(true);
    vi.advanceTimersByTime(ROUTE_SKELETON_GRACE_MS);
    expect(bar.route()).toBe(true);
    noteRouteSkeleton(false);
    await Promise.resolve();
    expect(bar.route()).toBe(false);
    bar.stop();
  });

  it("does not arm a grace when the skeleton is already mounted", () => {
    const bar = watch();
    beginRouteProgress();
    noteRouteSkeleton(true);
    noteRouteLocation();
    vi.advanceTimersByTime(ROUTE_SKELETON_GRACE_MS);
    expect(bar.route()).toBe(true);
    bar.stop();
  });

  it("cancels a pending grace when a new route begins", () => {
    const bar = watch();
    beginRouteProgress();
    noteRouteLocation();
    vi.advanceTimersByTime(ROUTE_SKELETON_GRACE_MS - 10);
    beginRouteProgress();
    vi.advanceTimersByTime(20);
    expect(bar.route()).toBe(true);
    bar.stop();
  });
});

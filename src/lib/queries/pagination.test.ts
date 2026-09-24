import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  pageRange,
  parsePagination,
  parseSort,
  withoutParam,
} from "@/lib/queries/pagination";

describe("parsePagination", () => {
  it("defaults to page 1 at 10 per page", () => {
    expect(parsePagination({})).toEqual({ page: 1, size: 10, skip: 0, take: 10 });
  });

  it("accepts the three offered sizes", () => {
    for (const size of [10, 30, 50]) {
      expect(parsePagination({ size: String(size) }).size).toBe(size);
    }
  });

  it("refuses a size that is not on the menu", () => {
    // A hand-edited ?size=100000 must not become an unbounded query.
    expect(parsePagination({ size: "100000" }).size).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePagination({ size: "11" }).size).toBe(DEFAULT_PAGE_SIZE);
  });

  it("computes skip from page and size", () => {
    expect(parsePagination({ page: "3", size: "30" })).toEqual({
      page: 3,
      size: 30,
      skip: 60,
      take: 30,
    });
  });

  it("falls back to page 1 for junk, zero or negatives", () => {
    for (const page of ["0", "-4", "abc", ""]) {
      expect(parsePagination({ page }).page).toBe(1);
    }
  });

  it("takes the first value when a key repeats", () => {
    expect(parsePagination({ page: ["2", "9"] }).page).toBe(2);
  });
});

describe("parseSort", () => {
  const allowed = ["poNumber", "poDate", "total"] as const;
  const fallback = { key: "poDate", dir: "desc" } as const;

  it("uses the fallback when nothing is asked for", () => {
    expect(parseSort({}, allowed, fallback)).toEqual(fallback);
  });

  it("accepts an allowed key and direction", () => {
    expect(parseSort({ sort: "total", dir: "asc" }, allowed, fallback)).toEqual({
      key: "total",
      dir: "asc",
    });
  });

  it("refuses a key that is not on the allow-list", () => {
    // The allow-list is what makes the key safe to put in an ORDER BY.
    expect(
      parseSort({ sort: "id; DROP TABLE users" }, allowed, fallback).key,
    ).toBe("poDate");
  });

  it("refuses a direction that is not asc or desc", () => {
    expect(parseSort({ dir: "sideways" }, allowed, fallback).dir).toBe("desc");
  });
});

describe("pageRange", () => {
  it("describes a full first page", () => {
    expect(pageRange(1, 10, 408)).toEqual({ from: 1, to: 10, pages: 41 });
  });

  it("clamps the last page to the total", () => {
    expect(pageRange(41, 10, 408)).toEqual({ from: 401, to: 408, pages: 41 });
  });

  it("reads 0 of 0 for an empty set, and still one page", () => {
    expect(pageRange(1, 10, 0)).toEqual({ from: 0, to: 0, pages: 1 });
  });
});

describe("withoutParam", () => {
  it("drops the named parameter and keeps the rest", () => {
    // The case that matters on /signin: dismissing the error must not also
    // forget where the visitor was going.
    expect(withoutParam("/signin", { error: "CredentialsSignin", next: "/buyers" }, "error")).toBe(
      "/signin?next=%2Fbuyers",
    );
  });

  it("returns the bare path when the dropped parameter was the only one", () => {
    // Not "/signin?" — a trailing question mark is a URL nobody wrote.
    expect(withoutParam("/signin", { reset: "1" }, "reset")).toBe("/signin");
  });

  it("keeps repeats of the parameters it is not dropping", () => {
    expect(withoutParam("/signin", { error: "x", a: ["1", "2"] }, "error")).toBe(
      "/signin?a=1&a=2",
    );
  });

  it("drops every repeat of the one it is", () => {
    expect(withoutParam("/signin", { error: ["a", "b"], next: "/" }, "error")).toBe(
      "/signin?next=%2F",
    );
  });

  it("is a no-op for a parameter that is not there", () => {
    expect(withoutParam("/signin", { next: "/" }, "error")).toBe("/signin?next=%2F");
  });

  it("skips an undefined value rather than writing it as a string", () => {
    expect(withoutParam("/signin", { error: "x", next: undefined }, "error")).toBe("/signin");
  });
});

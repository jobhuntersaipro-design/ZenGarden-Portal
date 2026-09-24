import { describe, expect, it } from "vitest";
import {
  RECENT_WINDOW,
  WELCOME_MESSAGES,
  greetingFor,
  parseRecent,
  pickWelcome,
  rememberShown,
} from "@/lib/welcome";

describe("pickWelcome", () => {
  it("never draws a line shown within the window", () => {
    const recent = Array.from({ length: RECENT_WINDOW }, (_, i) => i);
    for (let r = 0; r < 1; r += 0.01) {
      expect(recent).not.toContain(pickWelcome(recent, () => r));
    }
  });

  it("goes a whole window of sign-ins without repeating, whatever the draw", () => {
    let recent: number[] = [];
    const seen: number[] = [];
    let seed = 7;
    const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 200; i++) {
      const next = pickWelcome(recent, random);
      // The line drawn is none of the last RECENT_WINDOW lines drawn.
      expect(seen.slice(-RECENT_WINDOW)).not.toContain(next);
      seen.push(next);
      recent = rememberShown(recent, next);
    }
    // And the list is actually used rather than a handful of lines cycling.
    expect(new Set(seen).size).toBe(WELCOME_MESSAGES.length);
  });

  it("falls back to the whole list when every line is held back", () => {
    const all = Array.from({ length: 3 }, (_, i) => i);
    expect([0, 1, 2]).toContain(pickWelcome(all, () => 0.5, 3));
  });

  it("stays in range at the top edge of the draw", () => {
    expect(pickWelcome([], () => 0.999999)).toBe(WELCOME_MESSAGES.length - 1);
  });
});

describe("rememberShown", () => {
  it("keeps the window's length and moves a repeat to the end", () => {
    const long = Array.from({ length: RECENT_WINDOW }, (_, i) => i);
    expect(rememberShown(long, 99)).toHaveLength(RECENT_WINDOW);
    expect(rememberShown([1, 2, 3], 2)).toEqual([1, 3, 2]);
  });
});

describe("parseRecent", () => {
  it("drops anything that is not a line of this list", () => {
    expect(parseRecent(JSON.stringify([0, 3, -1, 2.5, "4", 999]))).toEqual([0, 3]);
    expect(parseRecent("not json")).toEqual([]);
    expect(parseRecent('{"a":1}')).toEqual([]);
    expect(parseRecent(null)).toEqual([]);
  });
});

describe("greetingFor", () => {
  it("follows the hour", () => {
    expect(greetingFor(8)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(19)).toBe("Good evening");
    expect(greetingFor(2)).toBe("Good evening");
  });
});

describe("WELCOME_MESSAGES", () => {
  it("holds no duplicates, and enough lines that the window is a third of it", () => {
    expect(new Set(WELCOME_MESSAGES).size).toBe(WELCOME_MESSAGES.length);
    expect(WELCOME_MESSAGES.length).toBeGreaterThanOrEqual(RECENT_WINDOW * 3);
  });
});

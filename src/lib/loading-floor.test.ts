import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOADING_FLOOR_MS, atLeastFloor, withLoadingFloor } from "./loading-floor";

// The floor is switched off under NODE_ENV=test so no other suite pays for
// it; these tests switch it back on and drive the clock by hand.
describe("the loading floor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "production");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  async function settledAfter<T>(promise: Promise<T>, ms: number) {
    let done = false;
    promise.then(() => (done = true), () => (done = true));
    await vi.advanceTimersByTimeAsync(ms);
    return done;
  }

  it("holds a fast load until the floor has passed", async () => {
    const result = atLeastFloor(Promise.resolve("page"));
    expect(await settledAfter(result, LOADING_FLOOR_MS - 1)).toBe(false);
    expect(await settledAfter(result, 1)).toBe(true);
    await expect(result).resolves.toBe("page");
  });

  it("adds nothing to a load slower than the floor", async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve("page"), 500));
    const result = atLeastFloor(slow);
    expect(await settledAfter(result, 499)).toBe(false);
    expect(await settledAfter(result, 1)).toBe(true);
  });

  it("lets a notFound or redirect through at once", async () => {
    const thrown = new Error("NEXT_NOT_FOUND");
    const result = atLeastFloor(Promise.reject(thrown));
    result.catch(() => {});
    expect(await settledAfter(result, 0)).toBe(true);
    await expect(result).rejects.toBe(thrown);
  });

  it("wraps a page so its render takes at least the floor", async () => {
    const Page = withLoadingFloor(async ({ id }: { id: string }) => `page ${id}`);
    const result = Promise.resolve(Page({ id: "7" }));
    expect(await settledAfter(result, LOADING_FLOOR_MS - 1)).toBe(false);
    expect(await settledAfter(result, 1)).toBe(true);
    await expect(result).resolves.toBe("page 7");
  });
});

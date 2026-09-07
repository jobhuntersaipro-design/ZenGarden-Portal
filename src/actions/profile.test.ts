import { beforeEach, describe, expect, it, vi } from "vitest";

const userUpdate = vi.fn();
const userFindUnique = vi.fn();
const storeGeneratedAvatar = vi.fn();
const clearAvatar = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { update: userUpdate, findUnique: userFindUnique } },
}));

class UnauthorizedError extends Error {}
const requireUser = vi.fn();
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError,
  requireUser: () => requireUser(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

class AvatarError extends Error {}
vi.mock("@/lib/avatar-store", () => ({
  AvatarError,
  storeGeneratedAvatar: (input: unknown) => storeGeneratedAvatar(input),
  clearAvatar: (a: unknown, b: unknown) => clearAvatar(a, b),
}));

const {
  removeAvatar,
  setGeneratedAvatar,
  signOutEverywhere,
  updateProfile,
} = await import("@/actions/profile");

const SESSION = { id: "u1", email: "aisha@test", name: "Aisha Rahman" };

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue(SESSION);
});

describe("updateProfile", () => {
  it("trims and saves a valid name", async () => {
    userUpdate.mockResolvedValue({});
    const result = await updateProfile({ name: "  Aisha Rahman  " });
    expect(result.success).toBe(true);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { name: "Aisha Rahman" },
    });
  });

  it("rejects an empty name without writing", async () => {
    const result = await updateProfile({ name: "   " });
    expect(result.success).toBe(false);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("returns a failure rather than throwing when signed out", async () => {
    requireUser.mockRejectedValue(new UnauthorizedError("You are not signed in."));
    const result = await updateProfile({ name: "Aisha Rahman" });
    expect(result.success).toBe(false);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});

describe("setGeneratedAvatar", () => {
  it("stores one of the five styles", async () => {
    storeGeneratedAvatar.mockResolvedValue({ url: "/api/avatars/u1?v=abc" });
    const result = await setGeneratedAvatar({ style: "clay", seed: "Aisha" });
    expect(result.success).toBe(true);
    expect(storeGeneratedAvatar).toHaveBeenCalledWith({
      userId: "u1",
      style: "clay",
      seed: "Aisha",
    });
  });

  it("rejects a style outside the five without storing", async () => {
    const result = await setGeneratedAvatar({ style: "lorelei", seed: "Aisha" });
    expect(result.success).toBe(false);
    expect(storeGeneratedAvatar).not.toHaveBeenCalled();
  });
});

describe("removeAvatar", () => {
  it("falls back to initials, never silently to the Google photo", async () => {
    clearAvatar.mockResolvedValue(undefined);
    const result = await removeAvatar();
    expect(result.success).toBe(true);
    expect(clearAvatar).toHaveBeenCalledWith("u1", null);
  });
});

describe("signOutEverywhere", () => {
  it("bumps sessionVersion by exactly one", async () => {
    userUpdate.mockResolvedValue({});
    const result = await signOutEverywhere();
    expect(result.success).toBe(true);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { sessionVersion: { increment: 1 } },
    });
  });
});

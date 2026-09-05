import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
const create = vi.fn();
const deleteMany = vi.fn();
const resetCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    loginAttempt: { count, create, deleteMany },
    passwordResetToken: { count: resetCount },
  },
}));

const {
  TooManyAttemptsError,
  checkLoginAllowed,
  checkPasswordResetAllowed,
  clientIp,
  recordLoginAttempt,
} = await import("@/lib/rate-limit");

beforeEach(() => {
  vi.clearAllMocks();
  // Keep the 1-in-50 sweep out of the way of the assertions below.
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  create.mockResolvedValue({});
  deleteMany.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkLoginAllowed", () => {
  it("allows a sign-in below the threshold on both dimensions", async () => {
    count.mockResolvedValue(4);
    await expect(checkLoginAllowed("a@b.com", "1.1.1.1")).resolves.toBeUndefined();
  });

  it("refuses at five failures for the email", async () => {
    count.mockResolvedValueOnce(5).mockResolvedValueOnce(0);
    await expect(checkLoginAllowed("a@b.com", "1.1.1.1")).rejects.toBeInstanceOf(
      TooManyAttemptsError,
    );
  });

  it("refuses at five failures for the IP even with a clean email", async () => {
    count.mockResolvedValueOnce(0).mockResolvedValueOnce(5);
    await expect(checkLoginAllowed("a@b.com", "1.1.1.1")).rejects.toBeInstanceOf(
      TooManyAttemptsError,
    );
  });

  it("counts only failures inside the fifteen-minute window", async () => {
    count.mockResolvedValue(0);
    const before = Date.now();
    await checkLoginAllowed("a@b.com", "1.1.1.1");
    const where = count.mock.calls[0][0].where;
    expect(where.success).toBe(false);
    expect(where.at.gte.getTime()).toBeGreaterThanOrEqual(before - 15 * 60_000);
    expect(where.at.gte.getTime()).toBeLessThanOrEqual(Date.now() - 15 * 60_000 + 5_000);
  });

  it("sweeps rows older than a day on the one call in fifty", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.001);
    count.mockResolvedValue(0);
    await checkLoginAllowed("a@b.com", "1.1.1.1");
    expect(deleteMany).toHaveBeenCalledOnce();
  });

  it("does not sweep on the other forty-nine", async () => {
    count.mockResolvedValue(0);
    await checkLoginAllowed("a@b.com", "1.1.1.1");
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe("recordLoginAttempt", () => {
  it("writes the attempt", async () => {
    await recordLoginAttempt("a@b.com", "1.1.1.1", true);
    expect(create).toHaveBeenCalledWith({
      data: { email: "a@b.com", ip: "1.1.1.1", success: true },
    });
  });

  it("swallows a write failure so a correct password still gets in", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    create.mockRejectedValue(new Error("db down"));
    await expect(
      recordLoginAttempt("a@b.com", "1.1.1.1", true),
    ).resolves.toBeUndefined();
  });
});

describe("checkPasswordResetAllowed", () => {
  it("allows the first three requests in the hour", async () => {
    resetCount.mockResolvedValue(2);
    await expect(checkPasswordResetAllowed("u1")).resolves.toBe(true);
  });

  it("refuses the fourth", async () => {
    resetCount.mockResolvedValue(3);
    await expect(checkPasswordResetAllowed("u1")).resolves.toBe(false);
  });
});

describe("clientIp", () => {
  it("takes the first address in x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" });
    expect(clientIp(headers)).toBe("3.3.3.3");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(new Headers({ "x-real-ip": "5.5.5.5" }))).toBe("5.5.5.5");
  });

  it("still returns a bucket when the proxy sends nothing", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

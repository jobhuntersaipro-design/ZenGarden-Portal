import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const userFindUnique = vi.fn();

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: userFindUnique } },
}));

const {
  UnauthorizedError,
  isStaff,
  requireAccount,
  requireClient,
  requireSuperAdmin,
  requireUser,
} = await import("@/lib/auth-guards");

const session = (role: string, buyerId: string | null = null) => ({
  user: {
    id: "u1",
    email: "someone@example.com",
    name: "Someone",
    image: null,
    role,
    mustChangePassword: false,
    buyerId,
  },
});

beforeEach(() => {
  vi.resetAllMocks();
  userFindUnique.mockResolvedValue({ buyerId: "buyer-1" });
});

/**
 * The whole design rests on `requireUser()` changing meaning from "signed in"
 * to "signed-in staff": every Server Action and route handler already calls it,
 * so that one change makes them all client-proof, and anything written later
 * that forgets clients exist fails closed.
 */
describe("the guard matrix", () => {
  const cases = [
    { role: "MEMBER", account: true, user: true, superAdmin: false, client: false },
    { role: "SUPER_ADMIN", account: true, user: true, superAdmin: true, client: false },
    { role: "CLIENT", account: true, user: false, superAdmin: false, client: true },
  ] as const;

  for (const row of cases) {
    it(`${row.role}: account=${row.account} user=${row.user} superAdmin=${row.superAdmin} client=${row.client}`, async () => {
      auth.mockResolvedValue(session(row.role, row.role === "CLIENT" ? "buyer-1" : null));

      const ran = async (fn: () => Promise<unknown>) => {
        try {
          await fn();
          return true;
        } catch {
          return false;
        }
      };

      expect(await ran(requireAccount)).toBe(row.account);
      expect(await ran(requireUser)).toBe(row.user);
      expect(await ran(requireSuperAdmin)).toBe(row.superAdmin);
      expect(await ran(requireClient)).toBe(row.client);
    });
  }
});

describe("requireUser", () => {
  it("refuses a client by name, so the message says why", async () => {
    auth.mockResolvedValue(session("CLIENT", "buyer-1"));
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("still refuses nobody at all", async () => {
    auth.mockResolvedValue(null);
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("requireClient", () => {
  it("re-reads the row rather than trusting the token, which is up to 5 minutes stale", async () => {
    auth.mockResolvedValue(session("CLIENT", "stale-buyer"));
    userFindUnique.mockResolvedValue({ buyerId: "moved-buyer" });
    const user = await requireClient();
    expect(userFindUnique).toHaveBeenCalled();
    expect(user.buyerId).toBe("moved-buyer");
  });

  it("refuses a client whose buyer has gone, rather than returning a null buyerId", async () => {
    auth.mockResolvedValue(session("CLIENT", "buyer-1"));
    userFindUnique.mockResolvedValue({ buyerId: null });
    await expect(requireClient()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("refuses a client the database no longer has", async () => {
    auth.mockResolvedValue(session("CLIENT", "buyer-1"));
    userFindUnique.mockResolvedValue(null);
    await expect(requireClient()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("isStaff", () => {
  it.each([
    ["MEMBER", true],
    ["SUPER_ADMIN", true],
    ["CLIENT", false],
  ])("%s -> %s", (role, expected) => {
    expect(isStaff(role as Parameters<typeof isStaff>[0])).toBe(expected);
  });
});

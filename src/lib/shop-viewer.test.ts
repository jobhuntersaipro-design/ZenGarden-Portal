import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUser = vi.fn();
const userFindUnique = vi.fn();

vi.mock("@/lib/auth-guards", () => ({ getSessionUser }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: userFindUnique } },
}));

const { loadShopViewer, GUEST } = await import("@/lib/shop-viewer");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("loadShopViewer", () => {
  it("returns GUEST when nobody is signed in", async () => {
    getSessionUser.mockResolvedValue(null);
    const viewer = await loadShopViewer();
    expect(viewer).toEqual(GUEST);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("returns \"staff\" for a signed-in ops user", async () => {
    getSessionUser.mockResolvedValue({ id: "u1", role: "MEMBER" });
    const viewer = await loadShopViewer();
    expect(viewer).toBe("staff");
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("returns the client viewer for a CLIENT with a buyer", async () => {
    getSessionUser.mockResolvedValue({ id: "u1", role: "CLIENT" });
    userFindUnique.mockResolvedValue({
      name: "Aisha Rahman",
      email: "aisha@acme.test",
      image: null,
      buyerId: "b1",
      buyer: { name: "Acme Industrial Sdn Bhd" },
    });
    const viewer = await loadShopViewer();
    expect(viewer).toEqual({
      kind: "client",
      id: "u1",
      name: "Aisha Rahman",
      email: "aisha@acme.test",
      image: null,
      buyerId: "b1",
      buyerName: "Acme Industrial Sdn Bhd",
    });
  });

  it("returns GUEST for a CLIENT whose fresh row has no buyer", async () => {
    getSessionUser.mockResolvedValue({ id: "u1", role: "CLIENT" });
    userFindUnique.mockResolvedValue({
      name: "Aisha Rahman",
      email: "aisha@acme.test",
      image: null,
      buyerId: null,
      buyer: null,
    });
    const viewer = await loadShopViewer();
    expect(viewer).toEqual(GUEST);
  });
});

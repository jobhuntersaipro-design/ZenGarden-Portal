import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findMany } } }));

const { listUsers } = await import("@/lib/queries/users");

beforeEach(() => {
  findMany.mockReset();
  findMany.mockResolvedValue([]);
});

describe("listUsers", () => {
  it("leaves deleted users off the list", async () => {
    await listUsers();
    const where = findMany.mock.calls[0][0].where;
    expect(where.NOT).toEqual({
      email: { endsWith: "@lovinghandsportal.invalid" },
    });
  });
});

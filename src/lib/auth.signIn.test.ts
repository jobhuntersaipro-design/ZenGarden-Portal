import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueUser = vi.fn();
const createUser = vi.fn();
const findManyUsers = vi.fn();
const findUniqueRequest = vi.fn();
const createRequest = vi.fn();
const updateRequest = vi.fn();
const sendEmail = vi.fn();

const env = { APP_URL: "https://portal.test", AUTO_APPROVE_DOMAIN: undefined as string | undefined };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: findUniqueUser, create: createUser, findMany: findManyUsers },
    accessRequest: {
      findUnique: findUniqueRequest,
      create: createRequest,
      update: updateRequest,
    },
  },
}));
vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { encodeEmail, resolveGoogleSignIn } = await import("@/lib/auth-access");

const google = (email: string) => ({ email, name: "Daniel Tan", image: null });

beforeEach(() => {
  vi.clearAllMocks();
  env.AUTO_APPROVE_DOMAIN = undefined;
  findUniqueUser.mockResolvedValue(null);
  findUniqueRequest.mockResolvedValue(null);
  findManyUsers.mockResolvedValue([{ email: "admin@lovinghandsportal.com" }]);
  createRequest.mockResolvedValue({});
  updateRequest.mockResolvedValue({});
  createUser.mockResolvedValue({});
  sendEmail.mockResolvedValue({ sent: true });
});

describe("resolveGoogleSignIn", () => {
  it("lets an active user in", async () => {
    findUniqueUser.mockResolvedValue({ id: "u1", disabledAt: null });
    await expect(resolveGoogleSignIn(google("aisha@lovinghandsportal.com"))).resolves.toBe(
      true,
    );
    expect(createRequest).not.toHaveBeenCalled();
  });

  it("sends a disabled user to the disabled copy, not to AccessDenied", async () => {
    findUniqueUser.mockResolvedValue({ id: "u1", disabledAt: new Date() });
    await expect(resolveGoogleSignIn(google("gone@lovinghandsportal.com"))).resolves.toBe(
      "/signin?error=disabled",
    );
  });

  it("creates a MEMBER for an unknown address on the auto-approve domain", async () => {
    env.AUTO_APPROVE_DOMAIN = "lovinghandsportal.com";
    await expect(resolveGoogleSignIn(google("new@lovinghandsportal.com"))).resolves.toBe(
      true,
    );
    expect(createUser).toHaveBeenCalledOnce();
    expect(createUser.mock.calls[0][0].data.role).toBe("MEMBER");
    expect(createRequest).not.toHaveBeenCalled();
  });

  it("does not auto-approve someone an admin has already declined", async () => {
    env.AUTO_APPROVE_DOMAIN = "lovinghandsportal.com";
    findUniqueRequest.mockResolvedValue({
      email: "declined@lovinghandsportal.com",
      status: "DECLINED",
    });
    await expect(
      resolveGoogleSignIn(google("declined@lovinghandsportal.com")),
    ).resolves.toBe("/signin/pending?declined=1");
    expect(createUser).not.toHaveBeenCalled();
  });

  it("does not auto-approve a lookalike domain", async () => {
    env.AUTO_APPROVE_DOMAIN = "lovinghandsportal.com";
    const result = await resolveGoogleSignIn(google("me@notlovinghandsportal.com"));
    expect(createUser).not.toHaveBeenCalled();
    expect(result).toBe(
      `/signin/pending?e=${encodeEmail("me@notlovinghandsportal.com")}`,
    );
  });

  it("queues an unknown address and emails every super admin", async () => {
    findManyUsers.mockResolvedValue([
      { email: "a@lovinghandsportal.com" },
      { email: "b@lovinghandsportal.com" },
    ]);
    const result = await resolveGoogleSignIn(google("daniel.tan@gmail.com"));
    expect(result).toBe(`/signin/pending?e=${encodeEmail("daniel.tan@gmail.com")}`);
    expect(createRequest).toHaveBeenCalledOnce();
    expect(createUser).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail.mock.calls[0][0].to).toEqual([
      "a@lovinghandsportal.com",
      "b@lovinghandsportal.com",
    ]);
    expect(sendEmail.mock.calls[0][0].subject).toBe("Access request from Daniel Tan");
  });

  it("does not email again when the request already exists", async () => {
    findUniqueRequest.mockResolvedValue({ email: "daniel.tan@gmail.com", status: "PENDING" });
    const result = await resolveGoogleSignIn(google("daniel.tan@gmail.com"));
    expect(result).toBe(`/signin/pending?e=${encodeEmail("daniel.tan@gmail.com")}`);
    expect(updateRequest).toHaveBeenCalledOnce();
    expect(createRequest).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("shows the declined copy to a declined requester", async () => {
    findUniqueRequest.mockResolvedValue({
      email: "daniel.tan@gmail.com",
      status: "DECLINED",
    });
    await expect(resolveGoogleSignIn(google("daniel.tan@gmail.com"))).resolves.toBe(
      "/signin/pending?declined=1",
    );
    expect(updateRequest).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("normalises the address before it looks anything up", async () => {
    await resolveGoogleSignIn({ ...google("  Daniel.Tan@Gmail.com  "), name: "Daniel Tan" });
    expect(findUniqueUser).toHaveBeenCalledWith({
      where: { email: "daniel.tan@gmail.com" },
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { email: "" };
const upsert = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { EXTRACTION_MODEL: "claude-sonnet-5" } }));
vi.mock("@/lib/prisma", () => ({ prisma: { appSetting: { upsert } } }));
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class extends Error {},
  requireUser: async () => session,
}));

const { setExtractionModel } = await import("@/actions/extraction-model");

describe("setExtractionModel", () => {
  beforeEach(() => upsert.mockReset());

  it("saves a listed model for the owner, whatever the email's case", async () => {
    session.email = "JobHunters.AI.Pro@gmail.com";
    expect(await setExtractionModel("claude-opus-5-5")).toEqual({
      success: true,
      data: undefined,
    });
    expect(upsert).toHaveBeenCalledOnce();
  });

  it("refuses anyone else, super admin or not", async () => {
    session.email = "aisha@lovinghandsportal.com";
    const result = await setExtractionModel("claude-opus-5-5");
    expect(result.success).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses a model that is not on the list", async () => {
    session.email = "jobhunters.ai.pro@gmail.com";
    const result = await setExtractionModel("gpt-5");
    expect(result.success).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });
});

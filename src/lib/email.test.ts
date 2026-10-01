import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));
vi.mock("@/lib/env", () => ({
  env: { RESEND_API_KEY: "re_a_real_looking_key", EMAIL_FROM: "Zen Garden <no-reply@test>" },
}));

const { sendEmail } = await import("@/lib/email");

const react = { type: "div", props: {}, key: null } as never;

beforeEach(() => {
  vi.resetAllMocks();
  send.mockResolvedValue({ error: null });
});

describe("sendEmail attachments", () => {
  it("passes attachments through to Resend", async () => {
    const content = Buffer.from("%PDF-1.7");
    const result = await sendEmail({
      to: "buyer@acme.test",
      subject: "We have your order",
      react,
      attachments: [{ filename: "W-2609-00015 purchase order.pdf", content }],
    });

    expect(result).toEqual({ sent: true });
    expect(send.mock.calls[0][0].attachments).toEqual([
      { filename: "W-2609-00015 purchase order.pdf", content },
      expect.objectContaining({ contentId: "zen-garden-logo" }),
    ]);
  });

  /**
   * Every email's header draws the logo as `cid:zen-garden-logo`, so it rides
   * inline on every send, including the callers that attach nothing, whose
   * header would otherwise show a broken image. It also means the array is
   * never the empty one Resend rejects.
   */
  it("attaches the header logo inline on every email", async () => {
    await sendEmail({ to: "buyer@acme.test", subject: "Hello", react });
    await sendEmail({ to: "buyer@acme.test", subject: "Hello", react, attachments: [] });

    for (const [call] of send.mock.calls) {
      expect(call.attachments).toEqual([
        {
          filename: "zen-garden.png",
          content: expect.any(Buffer),
          contentType: "image/png",
          contentId: "zen-garden-logo",
        },
      ]);
      // A real PNG, not an empty buffer: the signature bytes.
      expect(call.attachments[0].content.subarray(0, 4).toString("hex")).toBe("89504e47");
    }
  });

  it("never throws when Resend refuses the attachment", async () => {
    send.mockResolvedValue({ error: { message: "Attachment too large" } });
    expect(
      await sendEmail({
        to: "buyer@acme.test",
        subject: "We have your order",
        react,
        attachments: [{ filename: "big.pdf", content: Buffer.from("x") }],
      }),
    ).toEqual({ sent: false, error: "Attachment too large" });
  });
});

describe("sendEmailToEach", () => {
  it("sends one email per address, so a refused address costs that address alone", async () => {
    const { sendEmailToEach } = await import("@/lib/email");
    send.mockImplementation(async ({ to }: { to: string }) =>
      to.endsWith("@example.com")
        ? { error: { message: "Invalid `to` field." } }
        : { error: null },
    );

    const result = await sendEmailToEach(
      ["boss@zen.my", "test@example.com", "planner@zen.my", "boss@zen.my"],
      { subject: "New order", react },
      0,
    );

    expect(send.mock.calls.map((call) => call[0].to)).toEqual([
      "boss@zen.my",
      "test@example.com",
      "planner@zen.my",
    ]);
    expect(result.sent).toEqual(["boss@zen.my", "planner@zen.my"]);
    expect(result.failed).toEqual([
      { to: "test@example.com", error: "Invalid `to` field." },
    ]);
  });

  it("never throws when Resend itself throws", async () => {
    const { sendEmailToEach } = await import("@/lib/email");
    send.mockRejectedValue(new Error("network down"));
    const result = await sendEmailToEach(["a@zen.my"], { subject: "x", react }, 0);
    expect(result).toEqual({ sent: [], failed: [{ to: "a@zen.my", error: "network down" }] });
  });
});

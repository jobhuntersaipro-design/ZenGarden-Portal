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
    ]);
  });

  /**
   * Resend rejects an empty `attachments` array, and every caller predating
   * Phase 37 passes none at all — so the key is omitted rather than sent as
   * `undefined` or `[]`.
   */
  it("omits the key entirely when there is nothing to attach", async () => {
    await sendEmail({ to: "buyer@acme.test", subject: "Hello", react });
    expect("attachments" in send.mock.calls[0][0]).toBe(false);

    await sendEmail({ to: "buyer@acme.test", subject: "Hello", react, attachments: [] });
    expect("attachments" in send.mock.calls[1][0]).toBe(false);
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

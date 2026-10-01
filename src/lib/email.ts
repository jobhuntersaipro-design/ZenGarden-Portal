import type { ReactElement } from "react";
import { Resend } from "resend";
import { BRAND_LOGO_CID, brandLogoPng } from "@/lib/brand-logo";
import { env } from "@/lib/env";

export const resend = new Resend(env.RESEND_API_KEY);

/** Set when no real key is configured, so local runs never try to send. */
const isPlaceholderKey =
  !env.RESEND_API_KEY || env.RESEND_API_KEY.startsWith("PLACEHOLDER");

/**
 * One file on an email. Resend's own field names: `contentType` is always set
 * by the PO helpers, and `contentId` makes the file inline, referenced from
 * the body as `cid:<contentId>`.
 */
export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
  contentId?: string;
};

export type SendEmailArgs = {
  to: string | string[];
  subject: string;
  react: ReactElement;
  /**
   * Files to attach (Phase 37). `content` is the raw bytes; Resend takes a
   * Buffer or a base64 string and does the encoding itself.
   *
   * Kept optional so every existing caller is unchanged, and passed straight
   * through — this module decides nothing about what an attachment is for.
   * Sent one email at a time on purpose: Resend's batch endpoint drops
   * attachments.
   */
  attachments?: EmailAttachment[];
};

/**
 * The logo every email's header draws as `cid:zen-garden-logo` (`Layout.tsx`),
 * attached inline here so no template has to remember it.
 */
const LOGO_ATTACHMENT: EmailAttachment = {
  filename: "zen-garden.png",
  content: brandLogoPng(),
  contentType: "image/png",
  contentId: BRAND_LOGO_CID,
};

/**
 * Never throws. A failed notification must not roll back the action that
 * triggered it — callers get `{ sent }` and carry on.
 */
export async function sendEmail({
  to,
  subject,
  react,
  attachments,
}: SendEmailArgs): Promise<{ sent: boolean; error?: string }> {
  if (isPlaceholderKey) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email] skipped (no RESEND_API_KEY) → ${String(to)}: ${subject}`);
      return { sent: false };
    }
    return { sent: false, error: "RESEND_API_KEY is not configured" };
  }

  try {
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject,
      react,
      // The files the caller passed, then the header logo. Always present,
      // so the array is never the empty one Resend rejects.
      attachments: [...(attachments ?? []), LOGO_ATTACHMENT],
    });
    if (error) {
      console.error(`[email] ${subject} → ${String(to)}: ${error.message}`);
      return { sent: false, error: error.message };
    }
    return { sent: true };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`[email] ${subject} → ${String(to)}: ${message}`);
    return { sent: false, error: message };
  }
}

/**
 * Resend's default limit is two requests a second, per account. Sends to a
 * list are spaced by this much so the last one is not refused for speed.
 */
export const EACH_SEND_GAP_MS = 550;

export type SendToEachResult = {
  sent: string[];
  failed: { to: string; error: string }[];
};

/**
 * One email per recipient, never one email to all of them.
 *
 * Resend refuses a whole send when any one address in `to` is refused — an
 * `@example.com` test account, a typo — and then nobody on the list gets it.
 * That is how every staff "New order" email went missing on 2026-10-01: four
 * test users with `@example.com` addresses held the `po.view` role, so Resend
 * answered 422 to the one send that carried all seven addresses, while the
 * buyer's receipt, a separate send, arrived. Sent one by one, a refused
 * address costs that address alone, and each recipient sees only their own.
 *
 * Never throws, like `sendEmail`. Sequential and spaced, for Resend's rate
 * limit; the callers run inside `after()`, so nobody waits on the gap.
 */
export async function sendEmailToEach(
  recipients: readonly string[],
  args: Omit<SendEmailArgs, "to">,
  gapMs: number = EACH_SEND_GAP_MS,
): Promise<SendToEachResult> {
  const result: SendToEachResult = { sent: [], failed: [] };
  const unique = [...new Set(recipients.map((to) => to.trim()).filter(Boolean))];
  for (const [index, to] of unique.entries()) {
    if (index > 0 && gapMs > 0) await new Promise((done) => setTimeout(done, gapMs));
    const { sent, error } = await sendEmail({ ...args, to });
    if (sent) result.sent.push(to);
    else result.failed.push({ to, error: error ?? "not sent" });
  }
  return result;
}

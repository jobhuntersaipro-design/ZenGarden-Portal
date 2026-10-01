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
  /** Copied in, visible to everyone on the email (2026-10-01, staff orders). */
  cc?: string[];
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
  cc,
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
      ...(cc && cc.length > 0 ? { cc } : {}),
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

/**
 * Domains Resend refuses outright, answering 422 for the whole send:
 * `example.com` and its siblings, which test accounts use, and the reserved
 * `.invalid` / `.localhost` names (a deleted user is renamed to `.invalid`).
 */
const REFUSED_DOMAIN = /@(?:[^@]*\.)?(?:example\.(?:com|net|org)|[^@]+\.invalid|[^@]+\.localhost)$/i;

/**
 * Addresses never emailed, at the user's word (2026-10-01): the seed's super
 * admin, which has no mailbox behind it.
 */
const NEVER_EMAIL = new Set(["aisha@lovinghandsportal.com"]);

export const isRefusedAddress = (email: string) => {
  const address = email.trim();
  return REFUSED_DOMAIN.test(address) || NEVER_EMAIL.has(address.toLowerCase());
};

export type SendToAndCcResult = SendToEachResult & {
  /** Addresses left off: ones Resend would refuse, and `NEVER_EMAIL`. */
  skipped: string[];
  /** True when the one email went; false when it fell back to one each. */
  combined: boolean;
};

/**
 * One email, `to` the people it is for and `cc` everyone else who should see
 * it (2026-10-01, the user's choice for staff order emails).
 *
 * A combined send is all or nothing: Resend refuses the whole email when any
 * one address is refused, which is how every staff order email went missing
 * until 2026-10-01. So addresses Resend is known to refuse are left off
 * first, and if the one email is still refused it falls back to one email per
 * person (`sendEmailToEach`) rather than reaching nobody.
 *
 * Never throws.
 */
export async function sendEmailToAndCc(
  to: readonly string[],
  cc: readonly string[],
  args: Omit<SendEmailArgs, "to" | "cc">,
  gapMs: number = EACH_SEND_GAP_MS,
): Promise<SendToAndCcResult> {
  const clean = (list: readonly string[]) => [
    ...new Set(list.map((email) => email.trim()).filter(Boolean)),
  ];
  const skipped = [...clean(to), ...clean(cc)].filter(isRefusedAddress);
  let primary = clean(to).filter((email) => !isRefusedAddress(email));
  let copied = clean(cc).filter(
    (email) => !isRefusedAddress(email) && !primary.includes(email),
  );
  // Nobody to address it to: the copied people become the recipients.
  if (primary.length === 0) [primary, copied] = [copied, []];
  if (primary.length === 0) return { sent: [], failed: [], skipped, combined: false };

  const { sent, error } = await sendEmail({ ...args, to: primary, cc: copied });
  if (sent) {
    return { sent: [...primary, ...copied], failed: [], skipped, combined: true };
  }
  console.error(`[email] ${args.subject}: combined send refused (${error}); sending one each`);
  if (gapMs > 0) await new Promise((done) => setTimeout(done, gapMs));
  return { ...(await sendEmailToEach([...primary, ...copied], args, gapMs)), skipped, combined: false };
}

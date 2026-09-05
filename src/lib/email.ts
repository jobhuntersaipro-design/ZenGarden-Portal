import type { ReactElement } from "react";
import { Resend } from "resend";
import { env } from "@/lib/env";

export const resend = new Resend(env.RESEND_API_KEY);

/** Set when no real key is configured, so local runs never try to send. */
const isPlaceholderKey =
  !env.RESEND_API_KEY || env.RESEND_API_KEY.startsWith("PLACEHOLDER");

export type SendEmailArgs = {
  to: string | string[];
  subject: string;
  react: ReactElement;
};

/**
 * Never throws. A failed notification must not roll back the action that
 * triggered it — callers get `{ sent }` and carry on.
 */
export async function sendEmail({
  to,
  subject,
  react,
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

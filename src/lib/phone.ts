/**
 * A stored phone number as E.164, for Arc's phone input to open on.
 *
 * Phones were free text until the field became Arc's (2026-10-01), and every
 * buyer here is Malaysian first, so a number written the local way — a trunk
 * zero, `012-345 6789` — is read as +60. An international one keeps its own
 * code. Anything else opens empty rather than as a wrong number.
 */
export function phoneToE164(stored: string | null | undefined): string {
  const text = (stored ?? "").trim();
  if (!text) return "";
  const digits = text.replace(/\D/g, "");
  if (text.startsWith("+")) return digits ? `+${digits}` : "";
  if (text.startsWith("00") && digits.length > 4) return `+${digits.slice(2)}`;
  if (digits.startsWith("0") && digits.length >= 9) return `+60${digits.slice(1)}`;
  return "";
}

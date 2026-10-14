import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { ExtractionError, anthropic, readDocument } from "@/lib/extraction/extract-po";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date, YYYY-MM-DD");

/** What Claude reads off a certificate (2026-10-14). A person confirms it. */
export const CertificateExtractionSchema = z.object({
  /** First, so the model decides what it is reading before it fills one in. */
  kind: z.enum(["NOT", "HL", "COA", "other"]),
  reference: z.string().nullable(),
  expiresOn: isoDate.nullable(),
});
export type CertificateExtraction = z.infer<typeof CertificateExtractionSchema>;

const SYSTEM = `You read product certificates for a Malaysian personal-care manufacturer.
Classify the document:
- "NOT": a cosmetic / pharma product notification (e.g. NPRA notification, "Notification Note", notification number such as NOT…).
- "HL": a Halal certificate (JAKIM, MUI or another Halal authority).
- "COA": a Certificate of Analysis for a batch.
- "other": any other certificate or document (GMP, ISO, test report, licence…).
reference: the certificate, notification or batch number as printed, or null.
expiresOn: the date the certificate stops being valid, as YYYY-MM-DD — "expiry date", "valid until", "tarikh tamat", "exp." or, on a COA, the batch's expiry date. If only a validity period from an issue date is printed, add it. Null if no expiry can be read. Never guess a date that is not on the page.
Dates printed day-first (14/10/2026) are Malaysian: day, month, year.`;

export async function extractCertificate(
  bytes: Uint8Array,
  mimeType: string,
  client: Anthropic = anthropic,
): Promise<CertificateExtraction> {
  const message = await readDocument({
    bytes,
    mimeType,
    system: SYSTEM,
    instruction: "Read this certificate.",
    format: CertificateExtractionSchema,
    client,
  });
  if (!message.parsed_output) {
    throw new ExtractionError("We couldn't read that certificate — enter the expiry by hand");
  }
  return message.parsed_output;
}

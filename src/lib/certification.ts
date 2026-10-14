import { addMonths, format, parseISO } from "date-fns";

/**
 * Product certification (2026-10-14, ClickUp z8v9xnhuf7). Pure: no Prisma, so
 * the status rules every screen and the auto-approval share are tested here.
 *
 * Green APPROVED: expiry more than 3 months away. Yellow RENEW: within 3
 * months. Red EXPIRED: past expiry. Red MISSING: no certificate linked — red,
 * as the epic proposes, but named apart so an admin can tell "lapsed" from
 * "never uploaded". An override reads green whatever the certificates say.
 */
export const CERT_TYPES = ["NOT", "HL", "COA"] as const;
export type CertType = (typeof CERT_TYPES)[number];

export const CERT_LABEL: Record<CertType, string> = {
  NOT: "Pharma notification",
  HL: "Halal",
  COA: "Certificate of analysis",
};

export type CertStatus = "approved" | "renew" | "expired" | "missing";

export const STATUS_LABEL: Record<CertStatus, string> = {
  approved: "Approved",
  renew: "Renew",
  expired: "Expired",
  missing: "Not uploaded",
};

export const RENEW_WINDOW_MONTHS = 3;

/** One certificate's status on `today` (YYYY-MM-DD, Kuala Lumpur). */
export function expiryStatus(expiresOn: string, today: string): Exclude<CertStatus, "missing"> {
  if (expiresOn < today) return "expired";
  const renewFrom = format(addMonths(parseISO(today), RENEW_WINDOW_MONTHS), "yyyy-MM-dd");
  return expiresOn <= renewFrom ? "renew" : "approved";
}

export type TypeStatus = {
  status: CertStatus;
  /** The furthest expiry among the linked certificates; null when none. */
  expiresOn: string | null;
  overridden: boolean;
};

/**
 * A product's status for one type: the certificate that expires last decides
 * (a renewed certificate beside the lapsed one it replaces reads green).
 */
export function typeStatus(
  expiries: string[],
  overridden: boolean,
  today: string,
): TypeStatus {
  const latest = expiries.length ? expiries.reduce((a, b) => (a > b ? a : b)) : null;
  if (overridden) return { status: "approved", expiresOn: latest, overridden: true };
  return {
    status: latest ? expiryStatus(latest, today) : "missing",
    expiresOn: latest,
    overridden: false,
  };
}

export type ProductCerts = Record<CertType, TypeStatus>;

export function productCerts(
  certs: { type: CertType; expiresOn: string }[],
  overrides: CertType[],
  today: string,
): ProductCerts {
  return Object.fromEntries(
    CERT_TYPES.map((type) => [
      type,
      typeStatus(
        certs.filter((cert) => cert.type === type).map((cert) => cert.expiresOn),
        overrides.includes(type),
        today,
      ),
    ]),
  ) as ProductCerts;
}

export const allGreen = (certs: ProductCerts) =>
  CERT_TYPES.every((type) => certs[type].status === "approved");

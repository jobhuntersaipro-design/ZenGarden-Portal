import { formatDate } from "@/lib/dates";
import {
  CERT_LABEL,
  CERT_TYPES,
  STATUS_LABEL,
  type CertStatus,
  type ProductCerts,
} from "@/lib/certification";
import type { CertDots as Dots } from "@/lib/queries/certificates";

export const DOT_TONE: Record<CertStatus, string> = {
  approved: "bg-accent-green",
  renew: "bg-brand-amber",
  expired: "bg-accent-red",
  missing: "bg-accent-red",
};

/**
 * NOT · HL · COA, a dot each (2026-10-14). The colour is never alone: each dot
 * carries its type, and the status is in `title` and for screen readers.
 * Staff pass `certs` and also read the expiry; buyers pass `dots` — colours
 * only, nothing about the files behind them.
 */
export function CertDots({
  certs,
  dots,
  size = "sm",
  overlay = false,
}: {
  certs?: ProductCerts;
  dots?: Dots;
  size?: "sm" | "md";
  /**
   * A pill over the bottom-right of a product image (the shop, 2026-10-14).
   * The image well must be `relative`. One row, tighter gaps, so it fits a
   * two-up phone card's ~133px image.
   */
  overlay?: boolean;
}) {
  const layout = overlay
    ? "absolute right-xxs bottom-xxs gap-x-xs rounded-pill bg-canvas/90 px-xs py-xxs text-ink shadow-xs"
    : "flex-wrap gap-x-sm gap-y-xxs text-ink-secondary";
  return (
    <ul
      aria-label="Certification"
      className={`flex items-center ${layout} ${size === "md" ? "text-[length:var(--text-body-sm)]" : "text-[length:var(--text-caption)]"}`}
    >
      {CERT_TYPES.map((type) => {
        const status = certs?.[type].status ?? dots?.[type] ?? "missing";
        const detail = certs?.[type];
        const text = [
          `${CERT_LABEL[type]}: ${STATUS_LABEL[status]}`,
          detail?.overridden ? "approved by an admin" : null,
          detail?.expiresOn ? `expires ${formatDate(detail.expiresOn)}` : null,
        ]
          .filter(Boolean)
          .join(", ");
        return (
          <li key={type} title={text} className="inline-flex items-center gap-xxs whitespace-nowrap">
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT_TONE[status]}`} />
            <span aria-hidden>{type}</span>
            <span className="sr-only">{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

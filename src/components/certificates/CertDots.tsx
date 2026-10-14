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
}: {
  certs?: ProductCerts;
  dots?: Dots;
  size?: "sm" | "md";
}) {
  return (
    <ul
      aria-label="Certification"
      className={`flex flex-wrap items-center gap-x-sm gap-y-xxs ${size === "md" ? "text-[length:var(--text-body-sm)]" : "text-[length:var(--text-caption)]"} text-ink-secondary`}
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

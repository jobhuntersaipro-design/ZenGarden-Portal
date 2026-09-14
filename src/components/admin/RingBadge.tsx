/**
 * Neutral text inside an amber ring, and deliberately not the amber-*text*
 * badge the PO queue uses for "Needs review" (00-master.md §4).
 *
 * The distinction carries meaning: a queue someone must review is work in
 * front of them, while Pending and Invited are states someone else is expected
 * to move. Painting both in amber text made a waiting room look like a to-do
 * list.
 */
export function RingBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] text-ink-secondary ring-1 ring-brand-amber">
      {children}
    </span>
  );
}

const TONE = {
  Active: "text-accent-green",
  Disabled: "text-ink-tertiary",
} as const;

export function UserStatusBadge({
  status,
}: {
  status: "Active" | "Invited" | "Disabled";
}) {
  if (status === "Invited") return <RingBadge>Invited</RingBadge>;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] ${TONE[status]}`}
    >
      {status}
    </span>
  );
}

/**
 * A whole company's shop access, on the Buyer management table. "None" is
 * plain tertiary text rather than a pill: a badge for the absence of a thing
 * reads as a state someone set, and nobody set it.
 */
export function ShopAccessBadge({
  access,
}: {
  access: "Active" | "Invited" | "Disabled" | "None";
}) {
  if (access === "None") {
    return <span className="text-[length:var(--text-caption)] text-ink-tertiary">No login</span>;
  }
  return <UserStatusBadge status={access} />;
}

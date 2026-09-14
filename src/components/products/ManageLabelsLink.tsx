import Link from "next/link";

/**
 * The way from a picker to the screen that owns its values.
 *
 * Both product forms are super-admin-only already — `/products/new` redirects
 * a member and `ProductSheet` is rendered only for a super admin — so this
 * needs no role check of its own; `/admin/catalogue` 404s anyone else anyway.
 */
export function ManageLabelsLink({ hint }: { hint?: string }) {
  return (
    <p className="text-[length:var(--text-caption)] text-ink-tertiary">
      {hint ? `${hint} · ` : null}
      <Link
        href="/admin/catalogue"
        className="text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        Manage values
      </Link>
    </p>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { hasInAppHistory } from "@/components/portal/NavProgress";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

/**
 * The Back control every detail and secondary screen carries, above the
 * breadcrumb (brief G2). Breadcrumbs stay — Back is additive, and it is the
 * control ops users look for after a deep scroll.
 *
 * Where it goes is decided at click time, not at render, because it depends on
 * how the reader arrived:
 *
 * - There is an app page behind this one. History goes back, so they land on
 *   the list they left with its filters, sort, page and scroll position
 *   intact — a `push` to the section route would throw all of that away.
 * - A deep link, a bookmark, an email, opened straight onto this page.
 *   `history.back()` would leave the app entirely, so this navigates to
 *   `fallbackHref` instead. This is the case the brief calls out.
 *
 * Two signals, because neither is sufficient alone. A same-origin referrer
 * catches a full page load from elsewhere in the app; `hasInAppHistory()`
 * catches the far more common case of client-side navigation, which never
 * touches `document.referrer` at all.
 */
export function BackLink({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();
  const { push } = useUrlNavigation();

  const cameFromApp = () => {
    if (hasInAppHistory()) return true;
    if (!document.referrer) return false;
    try {
      // A referrer can be anything; a malformed one is not this app.
      if (new URL(document.referrer).origin !== window.location.origin) return false;
    } catch {
      return false;
    }
    // An in-app link opened in a new tab has the referrer but no entry to go
    // back to, so the length still has to be checked.
    return window.history.length > 1;
  };

  return (
    <button
      type="button"
      onClick={() => (cameFromApp() ? router.back() : push(fallbackHref))}
      className="mb-xs inline-flex items-center gap-xxs rounded-sm text-[length:var(--text-body-sm)] font-medium text-ink-secondary transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden />
      Back
    </button>
  );
}

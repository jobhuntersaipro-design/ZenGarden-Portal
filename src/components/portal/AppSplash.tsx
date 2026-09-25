import { BrandBadge } from "@/components/portal/Wordmark";

/**
 * The screen a cold open lands on while the server is still working
 * (2026-09-25, reported from a home-screen launch on an iPhone).
 *
 * Every route group's layout awaits the session and the user's row before it
 * sends a byte of its own, and the nearest `loading.tsx` below it cannot show
 * until it has. So a first open — a new tab, a home-screen icon, a serverless
 * function waking up — was white until all of that finished. `app/loading.tsx`
 * puts this above every group's layout, so the HTML shell streams at once and
 * the badge is on screen while the rest is fetched.
 *
 * The badge breathes and a short bar slides under it, so a slow start reads
 * as working rather than stuck. It fades in after a short delay, so an open
 * that answers quickly never flashes it. Under reduced motion both hold still
 * and the bar rests full-width, as it does everywhere else.
 */
export function AppSplash() {
  return (
    <div
      data-splash
      role="status"
      aria-live="polite"
      className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-lg bg-canvas px-md animate-splash-in"
    >
      <div className="animate-splash-breathe">
        <BrandBadge className="h-logo-badge-lg" alt="Zen Garden" />
      </div>
      <div className="h-1 w-32 overflow-hidden rounded-pill bg-surface-soft">
        <div className="h-full w-2/5 rounded-pill bg-brand-gradient animate-indeterminate" />
      </div>
      <p className="text-[length:var(--text-body-sm)] text-ink-secondary">Just a moment…</p>
    </div>
  );
}

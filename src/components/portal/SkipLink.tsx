/**
 * Off-screen until focused, then the first tab stop on every portal page.
 * Without it a keyboard user walks the wordmark, four nav rows and the account
 * menu before reaching the page they asked for — on the mobile tab bar that is
 * the same four rows again, after the content.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only rounded-sm bg-ink px-md py-xs text-[length:var(--text-button-md)] font-semibold text-canvas focus:not-sr-only focus:fixed focus:top-md focus:left-md focus:z-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      Skip to content
    </a>
  );
}

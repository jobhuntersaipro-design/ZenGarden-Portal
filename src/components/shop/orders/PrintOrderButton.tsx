"use client";

import { Printer } from "lucide-react";

/**
 * Prints the purchase order alone (Phase 35).
 *
 * The whole mechanism is one `window.print()` and the `@media print` block in
 * `globals.css`; there is no PDF library here and no stored file. A generated
 * purchase-order file is Phase 19 and still unbuilt, so a browser's own "Save
 * as PDF" is how a buyer keeps a copy today — worth knowing before anyone
 * reaches for a dependency to replace this.
 *
 * The button itself never prints: it sits outside `[data-print-region]`.
 */
export function PrintOrderButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex h-control-md items-center gap-xs rounded-pill border border-hairline-strong px-md text-[length:var(--text-button-md)] font-semibold text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <Printer className="size-4 shrink-0" aria-hidden />
      Print or save as PDF
    </button>
  );
}

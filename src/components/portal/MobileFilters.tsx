"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

/**
 * Secondary filters, folded away below `md`.
 *
 * Measured at 390 on 2026-09-22: the demand board spent **553px of an 844px
 * screen** on five stacked control rows before one row of the board, and the
 * purchase-order list put 24 controls above its own table. A toolbar that is
 * one row on a desktop is five on a phone, and a planner opening the board on
 * a phone wants the board.
 *
 * **A disclosure rather than a sheet**, which is what the spec first proposed:
 * a sheet is a portal, a focus trap and a scroll lock for something that only
 * needs to not be there, and the controls inside are the same controls either
 * way. This is a button and a `hidden` class.
 *
 * The page's primary control stays outside and always visible — grain on the
 * demand board, the range on the dashboard. Everything above `md` renders as
 * it always did: the button is `md:hidden` and the panel is `md:block`, so a
 * desktop toolbar is untouched and cannot be left collapsed by a class.
 */
export function MobileFilters({
  active,
  children,
}: {
  /** How many of the folded filters are set, for the button's badge. */
  active: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-filters"
        className="flex h-control-md items-center gap-xs self-start rounded-sm border border-hairline-strong px-sm text-[length:var(--text-body-sm)] text-ink transition-colors hover:border-ink-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:hidden"
      >
        <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
        Filters
        {/* The count is what makes a folded toolbar safe: a filter you cannot
            see and did not set is the defect this project keeps fixing. */}
        {active > 0 ? (
          <span className="rounded-full bg-ink px-xs text-[length:var(--text-caption)] font-semibold text-canvas">
            {active}
          </span>
        ) : null}
      </button>

      <div
        id="mobile-filters"
        className={`${open ? "flex" : "hidden"} flex-col gap-sm md:flex`}
      >
        {children}
      </div>
    </>
  );
}

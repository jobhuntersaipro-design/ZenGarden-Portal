"use client";

import { Trash2 } from "lucide-react";

/**
 * The trash icon in the purchase-order table's last column. Every row kind
 * opens its own dialog from the same control, so they look and hit alike —
 * 44px on a phone, where the row is a card and a finger does the pressing.
 */
export function RowDeleteButton({
  label,
  onOpen,
}: {
  /** e.g. "Delete upload scan.pdf" — the whole accessible name. */
  label: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        // The whole row is a link to the order; deleting must not navigate
        // there on the way.
        event.preventDefault();
        event.stopPropagation();
        onOpen();
      }}
      className="grid size-11 place-items-center rounded-sm text-ink-tertiary hover:text-accent-red focus-visible:outline-2 focus-visible:outline-focus sm:size-auto sm:p-xxs"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}

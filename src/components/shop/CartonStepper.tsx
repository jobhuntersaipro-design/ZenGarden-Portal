"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { piecesFor } from "@/lib/cartons";

/**
 * Cartons in, pieces shown. There is no conversion: `listPrice` is per carton
 * and `packSize` only tells the reader what is inside one.
 *
 * `useOptimistic` so the number moves on click rather than after the round
 * trip; the server value replaces it when the action settles.
 */
export function CartonStepper({
  value,
  packSize,
  unit,
  min = 1,
  onChange,
  label,
  size = "md",
}: {
  value: number;
  packSize: number | null;
  unit: string;
  min?: number;
  onChange: (cartons: number) => Promise<{ success: boolean; error?: string }>;
  label: string;
  /** `lg` is the product page's buy box (§5.4): 52px buttons and value fused
   * into one `rounded-pill` frame, matching the canvas exactly. `md` (the
   * default) keeps every existing caller — the cart table's own row —
   * unchanged, including the "N pieces" line under it. */
  size?: "md" | "lg";
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [typed, setTyped] = useState<string | null>(null);

  const commit = (next: number) => {
    if (next < min || !Number.isInteger(next)) return;
    startTransition(async () => {
      setOptimistic(next);
      const result = await onChange(next);
      if (!result.success) toast.error(result.error ?? "That didn't work.");
    });
  };

  const pieces = piecesFor(optimistic, packSize);

  if (size === "lg") {
    return (
      <div className="flex h-control-lg items-center overflow-hidden rounded-pill border border-hairline-strong">
        <button
          type="button"
          aria-label={`One fewer ${unit} — ${label}`}
          disabled={pending || optimistic <= min}
          onClick={() => commit(optimistic - 1)}
          className="flex size-control-lg shrink-0 items-center justify-center text-ink hover:bg-surface-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-40"
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <input
          aria-label={`${unit}s — ${label}`}
          inputMode="numeric"
          value={typed ?? String(optimistic)}
          onChange={(event) => setTyped(event.target.value.replace(/[^0-9]/g, ""))}
          onBlur={() => {
            if (typed !== null && typed !== "") commit(Number(typed));
            setTyped(null);
          }}
          className="h-full w-14 border-0 bg-transparent text-center text-[length:var(--text-body-lg)] font-semibold tabular-nums text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
        />
        <button
          type="button"
          aria-label={`One more ${unit} — ${label}`}
          disabled={pending}
          onClick={() => commit(optimistic + 1)}
          className="flex size-control-lg shrink-0 items-center justify-center text-ink hover:bg-surface-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-xxs">
      <div className="flex items-center gap-xxs">
        <Button
          variant="secondary"
          aria-label={`One fewer ${unit} — ${label}`}
          disabled={pending || optimistic <= min}
          onClick={() => commit(optimistic - 1)}
          className="size-11 p-0 sm:size-control-sm"
        >
          <Minus className="size-4" aria-hidden />
        </Button>
        <input
          aria-label={`${unit}s — ${label}`}
          inputMode="numeric"
          value={typed ?? String(optimistic)}
          onChange={(event) => setTyped(event.target.value.replace(/[^0-9]/g, ""))}
          onBlur={() => {
            if (typed !== null && typed !== "") commit(Number(typed));
            setTyped(null);
          }}
          className="h-11 w-16 rounded-sm border border-hairline-strong bg-transparent text-center text-[length:var(--text-body-sm)] tabular-nums text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus sm:h-control-sm"
        />
        <Button
          variant="secondary"
          aria-label={`One more ${unit} — ${label}`}
          disabled={pending}
          onClick={() => commit(optimistic + 1)}
          className="size-11 p-0 sm:size-control-sm"
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>
      <p className="text-[length:var(--text-caption)] text-ink-tertiary">
        {pieces === null
          ? `${optimistic} ${unit}${optimistic === 1 ? "" : "s"}`
          : `${pieces} piece${pieces === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}

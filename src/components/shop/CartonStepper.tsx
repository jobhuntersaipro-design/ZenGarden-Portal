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
}: {
  value: number;
  packSize: number | null;
  unit: string;
  min?: number;
  onChange: (cartons: number) => Promise<{ success: boolean; error?: string }>;
  label: string;
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

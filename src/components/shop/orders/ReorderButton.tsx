"use client";

import { RotateCcw } from "lucide-react";
import { reorderOrder } from "@/actions/reorder";
import { Spinner } from "@/components/portal/Spinner";
import { useReorder } from "@/components/shop/useReorder";

/**
 * "Order these again" (Phase 57 J1): every line of this order into the cart,
 * incrementing lines already there, then the cart. The one ink pill on the
 * order page.
 */
export function ReorderButton({ orderId }: { orderId: string }) {
  const { pending, run } = useReorder();

  return (
    <button
      type="button"
      onClick={() => run(() => reorderOrder({ id: orderId }))}
      disabled={pending}
      aria-busy={pending || undefined}
      className="pressable flex h-control-md w-full items-center justify-center gap-xs rounded-pill bg-ink px-lg text-[length:var(--text-button-md)] font-semibold text-canvas hover:bg-ink-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-progress disabled:opacity-80 sm:w-auto"
    >
      {pending ? <Spinner /> : <RotateCcw className="size-4 shrink-0" aria-hidden />}
      Order these again
    </button>
  );
}

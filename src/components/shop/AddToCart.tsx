"use client";

import { useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { addToCart } from "@/actions/cart";
import { unitLabel } from "@/lib/cartons";
import { useCartCount, useGuestCart } from "@/components/shop/GuestCartProvider";
import { useShopViewer } from "@/components/shop/ShopViewer";

/**
 * The one control that puts a product in an order — a card's ink pill or a
 * product page's larger buybox (Task 10). A guest writes straight to their
 * own `localStorage` cart and resolves at once; a signed-in client goes
 * through the `addToCart` Server Action, whose `revalidatePath` re-renders
 * the route into the action's own response — that is what moves the header
 * badge and this button's own "In cart (n)" label. Phase 30 removed the
 * `router.refresh()` that used to follow: it rendered the same tree a second
 * time and kept the button spinning for it.
 */
export function AddToCart({
  productId,
  name,
  unit,
  packSize,
  variant = "card",
  cartons,
}: {
  productId: string;
  name: string;
  unit: string;
  packSize: number | null;
  variant?: "card" | "buybox";
  cartons?: number;
}) {
  const viewer = useShopViewer();
  const guestCart = useGuestCart();
  const inCart = useCartCount(productId);
  const [pending, startTransition] = useTransition();
  const count = cartons ?? 1;

  const run = () => {
    startTransition(async () => {
      if (viewer.kind !== "client") {
        guestCart.add(productId, count);
        toast.success(`${count} ${unit}${count === 1 ? "" : "s"} added to your order.`);
        return;
      }

      const result = await addToCart({ productId, cartons: count });
      if (result.success) {
        toast.success(`${count} ${unit}${count === 1 ? "" : "s"} added to your order.`);
      } else {
        toast.error(result.error);
      }
    });
  };

  const fullLabel = inCart > 0 ? `In cart (${inCart})` : "Add to cart";

  return (
    <Button
      type="button"
      pending={pending}
      onClick={run}
      aria-label={`${fullLabel} — ${name}, ${unitLabel(packSize, unit)}`}
      className={cn(
        "w-full gap-xs",
        variant === "card" ? "h-control-md" : "h-control-lg",
      )}
    >
      <Plus className="size-4 shrink-0" aria-hidden />
      {pending ? (
        <span>Adding…</span>
      ) : variant === "card" ? (
        <>
          <span className="hidden sm:inline">{fullLabel}</span>
          <span className="sm:hidden">Add</span>
        </>
      ) : (
        <span>{fullLabel}</span>
      )}
    </Button>
  );
}

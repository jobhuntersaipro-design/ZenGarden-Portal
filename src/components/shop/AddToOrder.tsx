"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CartonStepper } from "@/components/shop/CartonStepper";
import { addToCart } from "@/actions/cart";

export function AddToOrder({
  productId,
  name,
  packSize,
  unit,
}: {
  productId: string;
  name: string;
  packSize: number | null;
  unit: string;
}) {
  const [cartons, setCartons] = useState(1);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-end gap-sm">
      <CartonStepper
        value={cartons}
        packSize={packSize}
        unit={unit}
        label={name}
        onChange={async (next) => {
          setCartons(next);
          return { success: true };
        }}
      />
      <Button
        pending={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await addToCart({ productId, cartons });
            if (result.success) {
              toast.success(
                `${cartons} ${unit}${cartons === 1 ? "" : "s"} added to your order.`,
              );
            } else {
              toast.error(result.error);
            }
          })
        }
      >
        Add to order
      </Button>
    </div>
  );
}

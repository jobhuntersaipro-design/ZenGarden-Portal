"use client";

import { useState } from "react";
import { toast } from "sonner";
import { setProductPublished } from "@/actions/products";
import { Button } from "@/components/ui/button";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";

/**
 * Whether the shop lists this product, said in one place and changed in one
 * click.
 *
 * This was `Product.active`, a switch inside the edit drawer, plus an
 * "Archive" button that set the same column — two controls for one fact, both
 * out of sight, and neither word telling a reader that the shop is what is at
 * stake. The pill states it, the button changes it, and the caption says what
 * unpublishing actually costs.
 */
export function PublishToggle({
  productId,
  published,
}: {
  productId: string;
  published: boolean;
}) {
  const refresh = useAwaitableRefresh();
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    try {
      const result = await setProductPublished(productId, !published);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(published ? "Product unpublished" : "Product published");
      await refresh();
    } catch {
      // An unguarded await here is what left the avatar picker permanently
      // disabled on 2026-09-08 — the same trap, guarded the same way.
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-sm">
      <span
        className={`rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] ${
          published ? "text-accent-green" : "text-ink-tertiary"
        }`}
        title={
          published
            ? "Listed in the shop, if it carries a price"
            : "Hidden from the shop; still here in ops"
        }
      >
        {published ? "Published" : "Unpublished"}
      </span>
      <Button variant="secondary" pending={pending} onClick={() => void run()}>
        {pending
          ? published
            ? "Unpublishing…"
            : "Publishing…"
          : published
            ? "Unpublish"
            : "Publish"}
      </Button>
    </div>
  );
}

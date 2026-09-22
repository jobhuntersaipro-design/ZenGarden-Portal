"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  deleteTestDataAction,
  generateTestDataAction,
} from "@/actions/test-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { MAX_ORDERS, type TestDataCounts } from "@/lib/test-data-shape";

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

/**
 * Throwaway data for eyeballing the portal, and one button to take it away.
 *
 * It sits on `/admin` rather than a route of its own for the reason Phase 24's
 * Contact details card did: it is one card, and a second admin route for it is
 * more chrome than it earns. When a second kind of tool arrives they share a
 * page.
 *
 * `blocked` is passed in from the server. The card still renders when it is
 * set, saying why, rather than disappearing — a control that vanishes on
 * production reads as a bug in the deploy.
 */
export function TestDataCard({
  counts,
  blocked,
}: {
  counts: TestDataCounts;
  blocked: string | null;
}) {
  const refresh = useAwaitableRefresh();
  const [orders, setOrders] = useState("25");
  const [busy, setBusy] = useState<"generate" | "delete" | null>(null);

  const total =
    counts.purchaseOrders + counts.products + counts.buyers + counts.shopOrders;
  const parsed = Number(orders);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_ORDERS;

  const generate = async () => {
    if (!valid) return;
    setBusy("generate");
    try {
      const result = await generateTestDataAction(parsed);
      if (!result.success) toast.error(result.error);
      else {
        toast.success(`${parsed} test purchase orders generated`);
        await refresh();
      }
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      const result = await deleteTestDataAction();
      if (!result.success) toast.error(result.error);
      else {
        toast.success("Test data deleted");
        await refresh();
      }
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-xl rounded-lg border border-hairline bg-canvas p-lg">
      <p className={label}>Testing</p>
      <h2 className="mb-xs font-display text-[length:var(--text-heading-md)] font-[650] text-ink">
        Test data
      </h2>
      <p className={caption}>
        Buyers, products across several markets, purchase orders spread over the
        six stages, a review queue and two shop orders. Every row is tagged, and
        Delete removes exactly those — nothing a person entered can be caught by
        it.
      </p>

      {blocked ? (
        <div className="mt-md flex flex-wrap items-center gap-md">
          <p className="text-[length:var(--text-caption)] text-accent-red">
            {blocked}
          </p>
          {/* Delete stays, because taking test data away is always safe. */}
          {total > 0 ? (
            <Button
              variant="secondary"
              onClick={remove}
              disabled={busy !== null}
              pending={busy === "delete"}
            >
              Delete all test data
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mt-lg flex flex-wrap items-end gap-md">
          <div className="flex flex-col gap-xxs">
            <label htmlFor="test-orders" className={label}>
              Purchase orders
            </label>
            <Input
              id="test-orders"
              type="number"
              min={1}
              max={MAX_ORDERS}
              value={orders}
              onChange={(event) => setOrders(event.target.value)}
              className="w-32"
              disabled={busy !== null}
            />
          </div>
          <Button
            onClick={generate}
            disabled={!valid || busy !== null}
            pending={busy === "generate"}
          >
            Generate
          </Button>
          <Button
            variant="secondary"
            onClick={remove}
            disabled={total === 0 || busy !== null}
            pending={busy === "delete"}
          >
            Delete all test data
          </Button>
        </div>
      )}

      <p className={`mt-md ${caption}`}>
        {total === 0
          ? "No test data in the database."
          : `In the database now: ${counts.purchaseOrders} purchase orders · ` +
            `${counts.lineItems} lines · ${counts.buyers} buyers · ` +
            `${counts.products} products · ${counts.reviewQueue} in the review queue · ` +
            `${counts.shopOrders} shop orders.`}
      </p>
    </section>
  );
}

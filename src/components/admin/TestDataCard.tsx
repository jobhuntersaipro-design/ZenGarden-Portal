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
  production,
}: {
  counts: TestDataCounts;
  production: boolean;
}) {
  const refresh = useAwaitableRefresh();
  const [orders, setOrders] = useState("25");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"generate" | "delete" | null>(null);

  const total =
    counts.purchaseOrders + counts.products + counts.buyers + counts.shopOrders;
  const parsed = Number(orders);
  const confirmed =
    !production || confirmation.trim().toLowerCase() === "production";
  const valid =
    Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_ORDERS && confirmed;

  const generate = async () => {
    if (!valid) return;
    setBusy("generate");
    try {
      const result = await generateTestDataAction(parsed, confirmation);
      if (!result.success) toast.error(result.error);
      else {
        toast.success(`${parsed} test purchase orders generated`);
        setConfirmation("");
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
      <p className={caption}>
        Buyers, products across several markets, purchase orders spread over the
        six stages, a review queue and two shop orders. Every row is tagged, and
        Delete removes exactly those — nothing a person entered can be caught by
        it.
      </p>

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

        {/* On production the count alone is not enough: this writes rows into
            the live database, so it asks for one deliberate act first. */}
        {production ? (
          <div className="flex flex-col gap-xxs">
            <label htmlFor="test-confirm" className={label}>
              Type &ldquo;production&rdquo; to confirm
            </label>
            <Input
              id="test-confirm"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="w-48"
              autoComplete="off"
              disabled={busy !== null}
            />
          </div>
        ) : null}

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

      {production ? (
        <p className="mt-md text-[length:var(--text-caption)] text-brand-amber">
          This is production. Anything generated here is written to the live
          database, and shows on the shop until it is deleted.
        </p>
      ) : null}

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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createShipment } from "@/actions/shipments";
import { OrderPicker } from "@/components/shipments/OrderPicker";
import { Button } from "@/components/ui/button";
import { MarketSelect } from "@/components/shipments/MarketSelect";
import { ModeChoice } from "@/components/shipments/ModeChoice";
import type { ShipmentMode } from "@/generated/prisma/enums";
import { Textarea } from "@/components/ui/textarea";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";
import { formDDefault } from "@/lib/shipments/checklist";
import type { ShippableOrder } from "@/lib/queries/shipments";
import { toast } from "@/lib/toast";

const LABEL = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
const SELECT =
  "h-control-md w-full rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-md)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus sm:w-80 sm:text-[length:var(--text-body-sm)]";

/**
 * Buyer first — its choice goes in the URL, so the server lists that buyer's
 * orders — then the orders and market (Phase 63 §4.3). Form D follows the market
 * and is not asked: an Indonesian shipment needs one.
 */
export function NewShipmentForm({
  buyers,
  buyerId,
  orders,
  preselected,
  locked,
  bookingId,
  markets,
  flags,
}: {
  buyers: { id: string; name: string; market: string | null }[];
  buyerId: string | null;
  orders: ShippableOrder[];
  preselected: string[];
  /** The order the page was opened from: ticked and cannot be unticked, and its buyer is fixed. */
  locked: string | null;
  bookingId: string | null;
  markets: string[];
  flags: Record<string, string>;
}) {
  const router = useRouter();
  const { replace } = useUrlNavigation();
  const buyer = buyers.find((b) => b.id === buyerId) ?? null;
  const [selected, setSelected] = useState(preselected);
  const [market, setMarket] = useState(buyer?.market && markets.includes(buyer.market) ? buyer.market : "");
  const [formD, setFormD] = useState(formDDefault(buyer?.market));
  const [note, setNote] = useState("");
  // Opened from a booking, it is going by sea.
  const [mode, setMode] = useState<ShipmentMode>("SEA");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseBuyer = (id: string) => {
    const params = new URLSearchParams();
    if (id) params.set("buyer", id);
    if (bookingId) params.set("booking", bookingId);
    replace(`/shipments/new${params.size ? `?${params}` : ""}`);
  };

  return (
    <form
      className="flex max-w-2xl flex-col gap-lg"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!buyerId) return setError("Choose the buyer first.");
        if (!selected.length) return setError("Choose at least one order.");
        setError(null);
        setPending(true);
        try {
          const result = await createShipment({
            buyerId,
            purchaseOrderIds: selected,
            market,
            formDRequired: formD,
            note,
            bookingId: mode === "SEA" ? bookingId : null,
            mode,
          });
          if (!result.success) return void setError(result.error);
          toast.success("Shipment created");
          router.push(`/shipments/${result.data.id}`);
        } catch {
          setError("We couldn't reach the server. Try again.");
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="flex flex-col gap-xs">
        <label htmlFor="shipment-buyer" className={LABEL}>
          Buyer
        </label>
        <select
          id="shipment-buyer"
          className={SELECT}
          value={buyerId ?? ""}
          disabled={!!locked}
          onChange={(event) => chooseBuyer(event.target.value)}
        >
          <option value="">Choose a buyer</option>
          {buyers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {buyer ? (
        <>
          <fieldset className="flex flex-col gap-xs">
            <legend className={`${LABEL} mb-xs`}>{mode === "LAND" ? "Orders on this truck" : "Orders in this container"}</legend>
            <OrderPicker orders={orders} selected={selected} onChange={setSelected} locked={locked} />
          </fieldset>

          {bookingId ? null : (
            <div className="flex flex-col gap-xs">
              <span id="shipment-mode-label" className={LABEL}>
                Delivery
              </span>
              <ModeChoice value={mode} onChange={setMode} labelledBy="shipment-mode-label" />
            </div>
          )}

          <div className="flex flex-col gap-xs">
            <label htmlFor="shipment-market" className={LABEL}>
              Market
            </label>
            <MarketSelect
              id="shipment-market"
              value={market}
              options={markets}
              flags={flags}
              className={SELECT}
              onChange={(value) => {
                setMarket(value);
                setFormD(formDDefault(value));
              }}
            />
          </div>

          <div className="flex flex-col gap-xs">
            <label htmlFor="shipment-note" className={LABEL}>
              Note (optional)
            </label>
            <Textarea id="shipment-note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          </div>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-[length:var(--text-body-sm)] text-accent-red">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" pending={pending} disabled={!buyer}>
          Create shipment
        </Button>
      </div>
    </form>
  );
}

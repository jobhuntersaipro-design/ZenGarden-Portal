"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createShipment } from "@/actions/shipments";
import { OrderPicker } from "@/components/shipments/OrderPicker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
 * orders — then the orders, market and Form D (Phase 63 §4.3).
 */
export function NewShipmentForm({
  buyers,
  buyerId,
  orders,
  preselected,
  bookingId,
}: {
  buyers: { id: string; name: string; market: string | null }[];
  buyerId: string | null;
  orders: ShippableOrder[];
  preselected: string[];
  bookingId: string | null;
}) {
  const router = useRouter();
  const { replace } = useUrlNavigation();
  const buyer = buyers.find((b) => b.id === buyerId) ?? null;
  const [selected, setSelected] = useState(preselected);
  const [market, setMarket] = useState(buyer?.market ?? "");
  const [formD, setFormD] = useState(formDDefault(buyer?.market));
  const [note, setNote] = useState("");
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
            bookingId,
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
            <legend className={`${LABEL} mb-xs`}>Orders in this container</legend>
            <OrderPicker orders={orders} selected={selected} onChange={setSelected} />
          </fieldset>

          <div className="flex flex-col gap-xs">
            <label htmlFor="shipment-market" className={LABEL}>
              Market
            </label>
            <Input
              id="shipment-market"
              value={market}
              maxLength={80}
              className="h-control-md sm:w-80"
              onChange={(event) => {
                setMarket(event.target.value);
                setFormD(formDDefault(event.target.value));
              }}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-sm">
            <Checkbox checked={formD} onCheckedChange={(v) => setFormD(v === true)} aria-label="Needs Form D" />
            <span className="text-[length:var(--text-body-sm)] text-ink">
              Needs Form D <span className="text-ink-tertiary">— lowers Indonesian import duty</span>
            </span>
          </label>

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

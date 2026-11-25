"use client";

import { useState } from "react";
import { updateLandDelivery } from "@/actions/shipments";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { formatDate } from "@/lib/dates";
import { toast } from "@/lib/toast";

/** Dates are `yyyy-mm-dd`; blanks are "". */
export type LandDelivery = {
  landCompany: string;
  landVehiclePlate: string;
  landDriverName: string;
  landDriverIc: string;
  landDriverPhone: string;
  landBorderCrossing: string;
  landPickupOn: string;
  landEtaOn: string;
  landDeliveredOn: string;
};

const TEXT: { key: keyof LandDelivery; label: string; placeholder?: string; max: number }[] = [
  { key: "landCompany", label: "Transport company", max: 120 },
  { key: "landVehiclePlate", label: "Lorry number", placeholder: "e.g. WXY 1234", max: 40 },
  { key: "landDriverName", label: "Driver name", max: 120 },
  { key: "landDriverIc", label: "Driver I/C number", placeholder: "e.g. 800101-14-5678", max: 20 },
  { key: "landDriverPhone", label: "Driver phone", placeholder: "e.g. 012-345 6789", max: 40 },
  { key: "landBorderCrossing", label: "Border crossing", placeholder: "e.g. Bukit Kayu Hitam", max: 120 },
];
const DATES: { key: keyof LandDelivery; label: string }[] = [
  { key: "landPickupOn", label: "Pickup" },
  { key: "landEtaOn", label: "Expected delivery" },
  { key: "landDeliveredOn", label: "Delivered" },
];
const LABEL = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";

/** The truck, typed by hand, in the booking card's place on a land shipment. */
export function LandDeliveryCard({
  shipmentId,
  delivery,
  canManage,
}: {
  shipmentId: string;
  delivery: LandDelivery;
  canManage: boolean;
}) {
  const refresh = useAwaitableRefresh();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(delivery);
  const [busy, setBusy] = useState(false);
  const empty = Object.values(delivery).every((v) => !v);

  const save = async () => {
    setBusy(true);
    try {
      const result = await updateLandDelivery({ id: shipmentId, ...values });
      if (!result.success) return void toast.error(result.error);
      await refresh();
      setOpen(false);
      toast.success("Delivery details saved");
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const rows = [
    ...TEXT.map(({ key, label }) => [label, delivery[key]] as const),
    ...DATES.map(({ key, label }) => [label, delivery[key] ? formatDate(delivery[key]) : ""] as const),
  ];

  return (
    <section className="min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
      <div className="mb-sm flex items-center justify-between gap-sm">
        <h2 className={LABEL}>Land delivery</h2>
        {canManage ? (
          <Button
            variant="secondary"
            onClick={() => {
              setValues(delivery);
              setOpen(true);
            }}
          >
            {empty ? "Add details" : "Edit"}
          </Button>
        ) : null}
      </div>
      {empty ? (
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          No truck details yet. Border papers go under Documents › Add another document.
        </p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-md gap-y-xs text-[length:var(--text-body-sm)] sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-ink-tertiary">{label}</dt>
              <dd className="break-words text-ink">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      )}

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Land delivery</DialogTitle>
            <DialogDescription>Every field is optional. Buyers don&apos;t see these.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
            {TEXT.map(({ key, label, placeholder, max }) => (
              <div key={key} className="flex min-w-0 flex-col gap-xs">
                <label htmlFor={`land-${key}`} className={LABEL}>
                  {label}
                </label>
                <Input
                  id={`land-${key}`}
                  value={values[key]}
                  placeholder={placeholder}
                  maxLength={max}
                  onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                />
              </div>
            ))}
            {DATES.map(({ key, label }) => (
              <div key={key} className="flex min-w-0 flex-col gap-xs">
                <span id={`land-${key}`} className={LABEL}>
                  {label}
                </span>
                <DateInput
                  aria-label={label}
                  value={values[key]}
                  onChange={(v) => setValues({ ...values, [key]: v })}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button pending={busy} onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

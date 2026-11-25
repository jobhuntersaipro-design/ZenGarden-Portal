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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LAND_STATUS_LABEL, LandStatusBadge, type LandStatus } from "@/components/shipments/ChecklistDots";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { formatDate } from "@/lib/dates";
import { toast } from "@/lib/toast";

/** Dates are `yyyy-mm-dd`; blanks are "". */
export type LandDelivery = {
  landStatus: LandStatus;
  landCompany: string;
  landVehiclePlate: string;
  landDriverName: string;
  landDriverIc: string;
  landDriverPhone: string;
  landBorderCrossing: string;
  landPickupOn: string;
  landEtaOn: string;
  landDeliveredOn: string;
  /** Whole number as typed; "" = nobody has said. */
  landPallets: string;
};

type TextKey = Exclude<keyof LandDelivery, "landStatus">;
const TEXT: { key: TextKey; label: string; placeholder?: string; max: number; required?: string }[] = [
  { key: "landCompany", label: "Transport company", max: 120 },
  { key: "landVehiclePlate", label: "Lorry number", placeholder: "e.g. WXY 1234", max: 40, required: "Enter the lorry number." },
  { key: "landDriverName", label: "Driver name", max: 120, required: "Enter the driver's name." },
  { key: "landDriverIc", label: "Driver I/C number", placeholder: "e.g. 800101-14-5678", max: 14 },
  { key: "landDriverPhone", label: "Driver phone", placeholder: "e.g. 012-345 6789", max: 40 },
  { key: "landBorderCrossing", label: "Border crossing", placeholder: "e.g. Bukit Kayu Hitam", max: 120 },
  { key: "landPallets", label: "Pallets on this truck", placeholder: "e.g. 12", max: 5, required: "Enter the pallets on this truck." },
];
const NUMERIC = new Set<TextKey>(["landPallets", "landDriverIc"]);
const STATUSES = Object.keys(LAND_STATUS_LABEL) as LandStatus[];

/** Digits only, dashed as a Malaysian I/C is printed: 800101-14-5678. */
export function formatIc(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 12);
  return [d.slice(0, 6), d.slice(6, 8), d.slice(8)].filter(Boolean).join("-");
}

/** What stops a save, field by field; the server says the same. */
function problems(v: LandDelivery) {
  const out: Partial<Record<TextKey, string>> = {};
  for (const f of TEXT) if (f.required && !v[f.key].trim()) out[f.key] = f.required;
  if (v.landPallets.trim() && !/^\d+$/.test(v.landPallets.trim())) out.landPallets = "Pallets are a whole number.";
  if (v.landDriverIc && !/^\d{6}-\d{2}-\d{4}$/.test(v.landDriverIc)) out.landDriverIc = "Driver I/C number reads like 800101-14-5678.";
  return out;
}
const DATES: { key: TextKey; label: string }[] = [
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
  const [errors, setErrors] = useState<Partial<Record<TextKey, string>>>({});
  const empty = TEXT.every(({ key }) => !delivery[key]) && DATES.every(({ key }) => !delivery[key]);
  const delivered = values.landStatus === "DELIVERED";

  const save = async () => {
    const found = problems(values);
    setErrors(found);
    const first = TEXT.find((f) => found[f.key]);
    if (first) return void document.getElementById(`land-${first.key}`)?.focus();
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
        <div className="flex items-center gap-sm">
          <h2 className={LABEL}>Land delivery</h2>
          <LandStatusBadge status={delivery.landStatus} />
        </div>
        {canManage ? (
          <Button
            variant="secondary"
            onClick={() => {
              setValues(delivery);
              setErrors({});
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
            <DialogDescription>
              Fields marked <span className="text-accent-red">*</span>{" "}
              are required. Buyers don&apos;t see these.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-xs sm:col-span-2">
              <label htmlFor="land-status" className={LABEL}>
                Status
              </label>
              <Select
                value={values.landStatus}
                onValueChange={(v) => {
                  const landStatus = v as LandStatus;
                  setValues({ ...values, landStatus, landDeliveredOn: landStatus === "DELIVERED" ? values.landDeliveredOn : "" });
                }}
              >
                <SelectTrigger id="land-status" className="h-control-md w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LAND_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {TEXT.map(({ key, label, placeholder, max, required }) => (
              <div key={key} className="flex min-w-0 flex-col gap-xs">
                <label htmlFor={`land-${key}`} className={LABEL}>
                  {label}
                  {required ? (
                    <span aria-hidden className="text-accent-red">
                      {" "}*
                    </span>
                  ) : null}
                </label>
                <Input
                  id={`land-${key}`}
                  value={values[key]}
                  placeholder={placeholder}
                  maxLength={max}
                  required={Boolean(required)}
                  aria-invalid={errors[key] ? true : undefined}
                  aria-describedby={errors[key] ? `land-${key}-error` : undefined}
                  inputMode={NUMERIC.has(key) ? "numeric" : undefined}
                  onChange={(e) => {
                    const value = key === "landDriverIc" ? formatIc(e.target.value) : e.target.value;
                    setValues({ ...values, [key]: value });
                    if (errors[key]) setErrors({ ...errors, [key]: undefined });
                  }}
                />
                {errors[key] ? (
                  <p id={`land-${key}-error`} role="alert" className="text-[length:var(--text-caption)] text-accent-red">
                    {errors[key]}
                  </p>
                ) : null}
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
                  disabled={key === "landDeliveredOn" && !delivered}
                  onChange={(v) => setValues({ ...values, [key]: v })}
                />
                {key === "landDeliveredOn" && !delivered ? (
                  <span className="text-[length:var(--text-caption)] text-ink-tertiary">Set the status to Delivered first.</span>
                ) : null}
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

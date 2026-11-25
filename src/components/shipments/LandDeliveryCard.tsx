"use client";

import { useState } from "react";
import { deleteTruck, saveTruck } from "@/actions/shipments";
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

const BLANK: LandDelivery = {
  landStatus: "PENDING",
  landCompany: "",
  landVehiclePlate: "",
  landDriverName: "",
  landDriverIc: "",
  landDriverPhone: "",
  landBorderCrossing: "",
  landPickupOn: "",
  landEtaOn: "",
  landDeliveredOn: "",
  landPallets: "",
};

/** The trucks, typed by hand, in the booking card's place on a land shipment (several since 2026-11-25). */
export function LandDeliveryCard({
  shipmentId,
  trucks,
  canManage,
}: {
  shipmentId: string;
  trucks: (LandDelivery & { id: string })[];
  canManage: boolean;
}) {
  const refresh = useAwaitableRefresh();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<TextKey, string>>>({});
  const [removing, setRemoving] = useState<(LandDelivery & { id: string }) | null>(null);
  const delivered = values.landStatus === "DELIVERED";

  const edit = (truck: (LandDelivery & { id: string }) | null) => {
    setEditing(truck?.id ?? null);
    setValues(truck ?? BLANK);
    setErrors({});
    setOpen(true);
  };

  const save = async () => {
    const found = problems(values);
    setErrors(found);
    const first = TEXT.find((f) => found[f.key]);
    if (first) return void document.getElementById(`land-${first.key}`)?.focus();
    setBusy(true);
    try {
      const result = await saveTruck({ shipmentId, ...(editing ? { truckId: editing } : {}), ...values });
      if (!result.success) return void toast.error(result.error);
      await refresh();
      setOpen(false);
      toast.success(editing ? "Truck saved" : "Truck added");
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const result = await deleteTruck({ truckId: removing.id });
      if (!result.success) return void toast.error(result.error);
      await refresh();
      setRemoving(null);
      toast.success("Truck removed");
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const rowsOf = (t: LandDelivery) => [
    ...TEXT.map(({ key, label }) => [label, t[key]] as const),
    ...DATES.map(({ key, label }) => [label, t[key] ? formatDate(t[key]) : ""] as const),
  ];

  return (
    <section className="min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
      <div className="mb-sm flex items-center justify-between gap-sm">
        <h2 className={LABEL}>Land delivery</h2>
        {canManage ? (
          <Button variant="secondary" onClick={() => edit(null)}>
            Add truck
          </Button>
        ) : null}
      </div>
      {trucks.length === 0 ? (
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          No trucks yet. Border papers go under Documents › Add another document.
        </p>
      ) : (
        <ol className="flex flex-col gap-md">
          {trucks.map((t, i) => (
            <li key={t.id} className="min-w-0 border-t border-hairline pt-md first:border-0 first:pt-0">
              <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
                <div className="flex min-w-0 items-center gap-sm">
                  <h3 className="break-words text-[length:var(--text-body-md)] font-medium text-ink">
                    Truck {i + 1}
                    {t.landVehiclePlate ? ` · ${t.landVehiclePlate}` : ""}
                  </h3>
                  <LandStatusBadge status={t.landStatus} />
                </div>
                {canManage ? (
                  <div className="flex gap-xs">
                    <Button variant="secondary" onClick={() => edit(t)}>
                      Edit
                    </Button>
                    <Button variant="secondary" onClick={() => setRemoving(t)}>
                      Delete
                    </Button>
                  </div>
                ) : null}
              </div>
              <dl className="grid grid-cols-1 gap-x-md gap-y-xs text-[length:var(--text-body-sm)] sm:grid-cols-2">
                {rowsOf(t).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-ink-tertiary">{label}</dt>
                    <dd className="break-words text-ink">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      )}

      <Dialog open={removing !== null} onOpenChange={(o) => !busy && !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this truck?</DialogTitle>
            <DialogDescription>
              {`${removing?.landVehiclePlate ? `Truck ${removing.landVehiclePlate}` : "This truck"} and its details will be removed from the shipment. This can't be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" disabled={busy} onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" pending={busy} onClick={remove}>
              Delete truck
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit truck" : "Add a truck"}</DialogTitle>
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

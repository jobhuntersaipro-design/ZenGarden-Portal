"use client";

import { Input } from "@/components/ui/input";
import { cartonCbm } from "@/lib/carton";
import { positiveDecimal } from "@/lib/validation/products";

type CartonKey = "cartonLengthCm" | "cartonWidthCm" | "cartonHeightCm" | "grossWeightKg";
type CartonValue = number | string | null;

const FIELDS: { key: CartonKey; label: string; unit: string; placeholder: string }[] = [
  { key: "cartonLengthCm", label: "Carton length", unit: "cm", placeholder: "23.5" },
  { key: "cartonWidthCm", label: "Carton width", unit: "cm", placeholder: "20" },
  { key: "cartonHeightCm", label: "Carton height", unit: "cm", placeholder: "25.4" },
  { key: "grossWeightKg", label: "Gross weight", unit: "kg", placeholder: "14.16" },
];

const schema = positiveDecimal("This");
const numberOf = (value: CartonValue) => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

/**
 * The carton's size and weight, shared by the create page and the edit drawer
 * so both refuse the same values. CBM is shown, never typed: it is derived
 * from the three sides on the server too, so there is nothing here to send.
 */
export function CartonFields({
  values,
  onChange,
}: {
  values: Record<CartonKey, CartonValue | undefined>;
  onChange: (key: CartonKey, value: string) => void;
}) {
  const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
  const cbm = cartonCbm({
    cartonLengthCm: numberOf(values.cartonLengthCm ?? null),
    cartonWidthCm: numberOf(values.cartonWidthCm ?? null),
    cartonHeightCm: numberOf(values.cartonHeightCm ?? null),
  });

  return (
    <>
      {FIELDS.map(({ key, label: text, unit, placeholder }) => {
        const value = values[key] ?? null;
        const parsed = schema.safeParse(value);
        const error = parsed.success ? null : `${text} must be a number above zero`;
        const id = `product-${key}`;
        return (
          <div key={key} className="flex flex-col gap-xxs">
            <label htmlFor={id} className={label}>
              {text} ({unit})
            </label>
            <Input
              id={id}
              inputMode="decimal"
              placeholder={placeholder}
              value={value === null ? "" : String(value)}
              onChange={(event) => onChange(key, event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            {error ? (
              <p
                id={`${id}-error`}
                role="alert"
                className="text-[length:var(--text-caption)] text-accent-red"
              >
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="flex flex-col gap-xxs">
        <label htmlFor="product-cbm" className={label}>
          CBM (m³)
        </label>
        <Input id="product-cbm" readOnly disabled value={cbm === null ? "" : String(cbm)} placeholder="—" />
        <p className="text-[length:var(--text-caption)] text-ink-tertiary">
          Length × width × height ÷ 1,000,000
        </p>
      </div>
    </>
  );
}

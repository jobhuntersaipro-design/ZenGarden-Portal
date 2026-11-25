"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Radix refuses an item whose value is "".
const NONE = "*none";

/**
 * Market as a list the super admin keeps under Admin › Catalogue › Markets,
 * each country with its flag (`marketFlags`). A native select cannot draw an
 * image and Windows prints flag emoji as two letters, hence Radix. A value
 * already saved that is no longer on the list stays offered, so an old
 * shipment opens with its own market rather than a blank.
 */
export function MarketSelect({
  id,
  value,
  options,
  flags,
  onChange,
  className,
  blank = "No market",
  label,
}: {
  id?: string;
  value: string;
  options: string[];
  flags: Record<string, string>;
  onChange: (market: string) => void;
  className: string;
  blank?: string;
  label?: string;
}) {
  const shown = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger id={id} aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectItem value={NONE}>{blank}</SelectItem>
        {shown.map((m) => (
          <SelectItem key={m} value={m}>
            <span className="flex items-center gap-xs">
              {flags[m] ? (
                // eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing to optimise
                <img src={flags[m]} alt="" className="aspect-3/2 h-3 shrink-0 rounded-xxs" />
              ) : (
                <span aria-hidden className="aspect-3/2 h-3 shrink-0" />
              )}
              {m}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

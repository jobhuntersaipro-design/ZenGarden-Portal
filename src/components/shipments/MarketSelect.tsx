"use client";

/**
 * Market as a list the super admin keeps under Admin › Catalogue › Markets.
 * A value already saved that is no longer on the list stays offered, so an
 * old shipment opens with its own market rather than a blank.
 */
export function MarketSelect({
  id,
  value,
  options,
  onChange,
  className,
}: {
  id?: string;
  value: string;
  options: string[];
  onChange: (market: string) => void;
  className: string;
}) {
  const shown = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select id={id} className={className} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">No market</option>
      {shown.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}

"use client";

import { Combobox } from "@/components/review/Combobox";

/** The value `Combobox` carries for "no market" — it stores `null`. */
const NONE = "";

/**
 * The market a formulation is made for, chosen from the markets already in
 * use and extended by typing a new one. A market is a country (Vietnam, India)
 * or a customer (Mydin, Hero Market) — the ops team's own inventory sheet
 * labels its product blocks with either, and this field is that label.
 *
 * There is deliberately no hardcoded catalogue here, unlike `PRODUCT_CATEGORIES`.
 * Categories are a fixed set because every share chart groups by them, and a
 * fragmented list would make those charts quietly wrong. A market is a label
 * on a single product: the cost of a missing entry (nobody can record a new
 * export market until someone ships code) is higher than the cost of a
 * near-duplicate, so super admins build the list themselves.
 *
 * `options` is the union of the markets on record and the current value —
 * `Combobox` renders its placeholder for any value absent from `options`, so a
 * pre-filled "Malaysia" on a brand-new catalogue would otherwise show as
 * unset. Case-insensitive matching in `Combobox` means typing "vietnam" where
 * "Vietnam" exists offers no "Add" row, so the list cannot fork on casing.
 */
export function MarketPicker({
  value,
  markets,
  onChange,
}: {
  value: string | null;
  markets: string[];
  onChange: (market: string | null) => void;
}) {
  const known = value && !markets.includes(value) ? [value, ...markets] : markets;

  return (
    <Combobox
      ariaLabel="Market"
      value={value ?? NONE}
      placeholder="No market"
      options={[
        { id: NONE, label: "No market" },
        ...known.map((market) => ({ id: market, label: market })),
      ]}
      createLabel={(query) => `+ Add “${query}”`}
      onSelect={(option) => onChange(option.id === NONE ? null : option.id)}
      onCreate={(market) => onChange(market)}
    />
  );
}

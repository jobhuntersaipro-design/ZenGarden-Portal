"use client";

import { Combobox } from "@/components/review/Combobox";

/** The value `Combobox` carries for "none" — the field stores `null`. */
const NONE = "";

/**
 * A label chosen from the values already in use and extended by typing a new
 * one. Brand (ZEN GARDEN, MR. KING), variant (Goat's Milk, Lavender) and
 * market (Vietnam, Mydin) all work this way — the ops team's inventory sheet
 * labels its product blocks with all three, and these fields are those labels.
 *
 * There is deliberately no hardcoded catalogue here, unlike `PRODUCT_CATEGORIES`.
 * Categories are a fixed set because every share chart groups by them, and a
 * fragmented list would make those charts quietly wrong. These are labels on a
 * single product: the cost of a missing entry (nobody can record a new
 * fragrance or export market until someone ships code) is higher than the
 * cost of a near-duplicate, so super admins build the lists themselves.
 *
 * `options` is the union of the values on record and the current value —
 * `Combobox` renders its placeholder for any value absent from `options`, so a
 * pre-filled "Malaysia" on a brand-new catalogue would otherwise show as
 * unset. Case-insensitive matching in `Combobox` means typing "vietnam" where
 * "Vietnam" exists offers no "Add" row, so a list cannot fork on casing.
 */
export function GrowingListPicker({
  label,
  value,
  known,
  onChange,
}: {
  /** Sentence-case noun: "Brand", "Variant", "Market". */
  label: string;
  value: string | null;
  known: string[];
  onChange: (value: string | null) => void;
}) {
  const options = value && !known.includes(value) ? [value, ...known] : known;
  const none = `No ${label.toLowerCase()}`;

  return (
    <Combobox
      ariaLabel={label}
      value={value ?? NONE}
      placeholder={none}
      options={[
        { id: NONE, label: none },
        ...options.map((entry) => ({ id: entry, label: entry })),
      ]}
      createLabel={(query) => `+ Add “${query}”`}
      onSelect={(option) => onChange(option.id === NONE ? null : option.id)}
      onCreate={(entry) => onChange(entry)}
    />
  );
}

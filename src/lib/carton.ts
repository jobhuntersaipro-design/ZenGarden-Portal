/**
 * A carton's measurements (2026-10-28). CBM is L × W × H ÷ 1,000,000 to four
 * decimals, derived on every read so it can never disagree with the sides it
 * comes from, and so no caller can send one.
 */
export interface CartonSize {
  cartonLengthCm: number | null;
  cartonWidthCm: number | null;
  cartonHeightCm: number | null;
  grossWeightKg: number | null;
}

/** Null unless all three sides are set. */
export function cartonCbm(size: Pick<CartonSize, "cartonLengthCm" | "cartonWidthCm" | "cartonHeightCm">): number | null {
  const { cartonLengthCm: l, cartonWidthCm: w, cartonHeightCm: h } = size;
  if (!l || !w || !h) return null;
  return Math.round((l * w * h) / 100) / 10000;
}

/** 0.0119, 20, 23.5 — no trailing zeros, never "0". */
const figure = (value: number) => String(Number(value.toFixed(4)));

/**
 * The lines a buyer reads, as [label, value]: each left out when its value
 * is missing. Size needs all three sides; a partial size says nothing useful.
 */
export function cartonSpecs(size: CartonSize): [string, string][] {
  const { cartonLengthCm: l, cartonWidthCm: w, cartonHeightCm: h, grossWeightKg: kg } = size;
  const cbm = cartonCbm(size);
  const specs: [string, string][] = [];
  if (l && w && h) specs.push(["Carton measurements", `${figure(l)}cm x ${figure(w)}cm x ${figure(h)}cm`]);
  if (kg) specs.push(["Gross weight", `${figure(kg)}kg`]);
  if (cbm) specs.push(["Cbm", `${figure(cbm)}m³`]);
  return specs;
}

/** "Carton measurements: 23.5cm x 20cm x 25.4cm", one string per line. */
export const cartonLines = (size: CartonSize) =>
  cartonSpecs(size).map(([label, value]) => `${label}: ${value}`);

/** The four columns, for a Prisma `select`. */
export const CARTON_SELECT = {
  cartonLengthCm: true,
  cartonWidthCm: true,
  cartonHeightCm: true,
  grossWeightKg: true,
} as const;

/** The four values off a row, so a payload never carries more than these. */
export const pickCarton = (row: CartonSize): CartonSize => ({
  cartonLengthCm: row.cartonLengthCm,
  cartonWidthCm: row.cartonWidthCm,
  cartonHeightCm: row.cartonHeightCm,
  grossWeightKg: row.grossWeightKg,
});

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
export const figure = (value: number) => String(Number(value.toFixed(4)));

/** "0.0595m³". The one spelling of a CBM figure on every surface. */
export const formatCbm = (value: number) => `${figure(value)}m³`;

/**
 * A line's CBM: the carton's (as the buyer reads it, four decimals) times the
 * cartons ordered. Null where the product has no carton size yet.
 */
export const lineCbm = (perCarton: number | null, cartons: number): number | null =>
  perCarton === null ? null : Math.round(perCarton * cartons * 10000) / 10000;

/**
 * An order's total CBM over its lines (2026-10-28). `missing` counts the lines
 * with no carton size, so a total is never shown as complete when it is not;
 * `total` is null when no line has one.
 */
export function totalCbm(lines: { cbm: number | null }[]): { total: number | null; missing: number } {
  const known = lines.filter((line) => line.cbm !== null);
  const sum = known.reduce((acc, line) => acc + (line.cbm ?? 0), 0);
  return {
    total: known.length ? Math.round(sum * 10000) / 10000 : null,
    missing: lines.length - known.length,
  };
}

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
  if (cbm) specs.push(["Cbm", formatCbm(cbm)]);
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

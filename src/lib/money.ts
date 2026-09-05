import { Prisma } from "@/generated/prisma/client";

/**
 * Money is Prisma.Decimal in the database and a string across the
 * server/client boundary (00-master.md §4). Nothing here converts to a float.
 */
export type MoneyInput = Prisma.Decimal | string | number;

const toDecimal = (value: MoneyInput): Prisma.Decimal =>
  value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);

/** `RM 1,234.50`. Always two decimals, grouped thousands, MYR only. */
export function formatMYR(value: MoneyInput): string {
  const decimal = toDecimal(value);
  const negative = decimal.isNegative();
  const [whole, fraction = "00"] = decimal.abs().toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}RM ${grouped}.${fraction}`;
}

/**
 * Parses user input back to a Decimal. Tolerates the RM prefix, grouping
 * commas and surrounding space. Throws on anything else rather than
 * silently yielding NaN.
 */
export function parseMYR(input: string): Prisma.Decimal {
  const cleaned = input.trim().replace(/^RM\s*/i, "").replace(/,/g, "");
  if (cleaned === "" || !/^-?\d*\.?\d+$/.test(cleaned)) {
    throw new Error(`Not a MYR amount: ${JSON.stringify(input)}`);
  }
  return new Prisma.Decimal(cleaned);
}

/** Exact sum. Returns Decimal(0) for an empty list. */
export function sumDecimals(list: readonly MoneyInput[]): Prisma.Decimal {
  return list.reduce<Prisma.Decimal>(
    (total, value) => total.plus(toDecimal(value)),
    new Prisma.Decimal(0),
  );
}

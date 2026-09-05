// The browser entry: `money.ts` is imported by client components (the review
// form, the line-item table), and `client` would pull PrismaClient and
// `node:module` into the bundle. Same `Decimal`, no server runtime.
import { Prisma } from "@/generated/prisma/browser";

/**
 * The browser namespace exports `Decimal` as a value only, so the instance
 * type is derived from it rather than written as `Prisma.Decimal`.
 */
export type Decimal = InstanceType<typeof Prisma.Decimal>;

/**
 * Money is a Decimal in the database and a string across the server/client
 * boundary (00-master.md §4). Nothing here converts to a float.
 */
export type MoneyInput = Decimal | string | number;

const toDecimal = (value: MoneyInput): Decimal =>
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
export function parseMYR(input: string): Decimal {
  const cleaned = input.trim().replace(/^RM\s*/i, "").replace(/,/g, "");
  if (cleaned === "" || !/^-?\d*\.?\d+$/.test(cleaned)) {
    throw new Error(`Not a MYR amount: ${JSON.stringify(input)}`);
  }
  return new Prisma.Decimal(cleaned);
}

/** Exact sum. Returns Decimal(0) for an empty list. */
export function sumDecimals(list: readonly MoneyInput[]): Decimal {
  return list.reduce<Decimal>(
    (total, value) => total.plus(toDecimal(value)),
    new Prisma.Decimal(0),
  );
}

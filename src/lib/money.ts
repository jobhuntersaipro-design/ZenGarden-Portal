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

/**
 * `RM 1,234.50`. Two decimals, grouped thousands, MYR only. Chart value labels
 * pass `0` and get `RM 1,235`: they sit beside a bar and a rounded figure is
 * what fits, the exact one is a hover away in the tooltip.
 *
 * The space after "RM" is a no-break space (S-18, 2026-09-29): at 1280 a KPI
 * tile set "RM" on one line and "10,252,851.50" on the next. Every screen,
 * chart and email that prints money goes through here, so one character
 * keeps the currency with its figure everywhere.
 */
export const MYR_PREFIX = "RM\u00A0";

export function formatMYR(value: MoneyInput, decimals: 0 | 2 = 2): string {
  const decimal = toDecimal(value);
  const sign = decimal.isNegative() ? "-" : "";
  return `${sign}${MYR_PREFIX}${formatGrouped(decimal.abs(), decimals)}`;
}

/**
 * `1,234.50` — the figure without the currency, thousands grouped. The
 * purchase order prints its currency once, in the total's label, so every
 * figure in its columns uses this. Pass `0` for a count (`1,200` cartons).
 */
export function formatGrouped(value: MoneyInput, decimals: 0 | 2 = 2): string {
  const decimal = toDecimal(value);
  const negative = decimal.isNegative();
  const [whole, fraction] = decimal.abs().toFixed(decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
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

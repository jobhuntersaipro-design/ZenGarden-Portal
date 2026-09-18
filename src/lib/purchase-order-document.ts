// The *browser* entry, not "@/generated/prisma/client": this module is
// imported by `ReviewSendForm`, a client component, and the full client drags
// the Prisma runtime into the browser bundle — which fails to chunk at all
// ("the chunking context does not support external modules: node:module").
// Only `Decimal` is wanted here, and the browser entry carries it. The same
// import is already used by the shop's product page.
import { Prisma } from "@/generated/prisma/browser";
import { groupName } from "@/lib/product-groups";
import type { CartLine } from "@/lib/queries/cart";
import type { ReviewBuyer } from "@/lib/queries/shop-checkout";

/**
 * The purchase order, as data (Phase 33).
 *
 * Pure: no Prisma client, no I/O, no React. It is the one place that decides
 * what goes on the document, so the preview a buyer confirms and any file
 * generated later cannot say different things.
 *
 * **The money is `Prisma.Decimal` throughout and the total is the sum of the
 * lines**, so the document can never disagree with the order it describes.
 * `subtotal` is passed in rather than trusted from a caller's own arithmetic:
 * it is what `submitWebOrder` will snapshot, and a test asserts the two match
 * to the cent.
 *
 * **Money stays unformatted here** (`"1234.50"`), because
 * `documentAgreesWithOrder` does arithmetic on it. The two renderers group
 * the thousands when they print (Phase 42).
 */

/**
 * The seller named on the document (Phase 42): its masthead, and the only
 * place we name ourselves on it. The shop and the portal keep "Zen Garden" as
 * their wordmark; a purchase order carries the registered company.
 *
 * There is no supplier block and no supplier record (2026-09-18, at the
 * user's request): we *are* the supplier, so the masthead says it once and
 * nothing is configurable.
 */
export const DOCUMENT_COMPANY_NAME = "ZEN GARDEN TRADING (M) SDN BHD";

/** Printed under the dates while `awaitingConfirmation` (Phase 45). */
export const AWAITING_CONFIRMATION_NOTE =
  "Our team will confirm the expected delivery and payment terms as soon as possible.";

export type PoDocumentLine = {
  position: number;
  /** The seller's code. A shop order has no buyer-printed code to show. */
  sku: string;
  /** The product's name with its own " — Variant" suffix taken off. */
  description: string;
  /** "Goat's Milk · Vietnam". Empty where neither is known. */
  detailCaption: string;
  /**
   * The line's quantity columns (Phase 45). Each is null where the product
   * does not carry the figure it comes from, and the renderers print "—".
   */
  piecesPerCarton: number | null;
  cartonsPerPallet: number | null;
  totalPieces: number | null;
  cartons: number;
  /**
   * Cartons ÷ cartons per pallet, rounded up to the pallets that ship: a
   * part-filled pallet is still a pallet (Phase 45, at the user's request).
   */
  pallets: number | null;
  unitPrice: string;
  amount: string;
};

export type PoDocumentParty = {
  name: string;
  /** Free-form, printed with its line breaks kept. */
  address: string | null;
  /** "Aisha Rahman · orders@acme.test" — either half may be missing. */
  contact: string | null;
};

export type PoDocumentData = {
  /**
   * Our Order ID (`W-2609-00014`), printed under the title and in the footer.
   * Null on a purchase order uploaded as a scan, which has none.
   */
  orderId: string | null;
  /**
   * The buyer's own PO number, in its own cell; "—" when they gave none.
   * Never filled from the Order ID (2026-09-17) — until then the masthead
   * printed the Order ID wherever the buyer had no number of their own.
   */
  poNumber: string | null;
  orderDate: string;
  /**
   * The day the team committed to (Phase 38). Null on a cart and on an order
   * still waiting, and the cell then reads "—" (Phase 44, at the user's
   * request — until then it was not drawn at all). The stored PDF is redrawn
   * when the team confirms, so the date replaces the dash.
   */
  deliveryDate: string | null;
  /**
   * True on a cart and on an order the team has not yet confirmed or declined:
   * the document then says under its dates that the team will confirm the
   * delivery and the payment terms (Phase 45).
   */
  awaitingConfirmation: boolean;
  paymentTerms: string | null;
  currency: string;
  buyer: PoDocumentParty;
  lines: PoDocumentLine[];
  subtotal: string;
  /**
   * Printed as its own row only when there is some. A shop order has none —
   * the cart quotes no tax — but a purchase order read off a customer's own
   * document can, and omitting it would print a total its own rows do not
   * reach.
   */
  tax: string | null;
  total: string;
  notes: string | null;
};

const joinContact = (name: string | null, email: string | null): string | null => {
  const parts = [name, email].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
};

/**
 * A line's quantity columns (Phase 45), from the product's pack size and
 * cartons per pallet and the line's cartons. Shared by both builders, so a
 * cart and a stored order count identically.
 *
 * Pallets are rounded up to what ships: 1,200 cartons at 52 a pallet is 24,
 * and 25 cartons at 60 is 1. A product with no pallet figure has no pallet
 * count, rather than a guessed one.
 */
export function documentQuantities(
  packSize: number | null,
  cartonsPerPallet: number | null,
  cartons: number,
): Pick<
  PoDocumentLine,
  "piecesPerCarton" | "cartonsPerPallet" | "totalPieces" | "cartons" | "pallets"
> {
  return {
    piecesPerCarton: packSize,
    cartonsPerPallet,
    totalPieces: packSize === null ? null : packSize * cartons,
    cartons,
    pallets:
      cartonsPerPallet === null || cartonsPerPallet <= 0
        ? null
        : Math.ceil(cartons / cartonsPerPallet),
  };
}

/**
 * The description cell's two text lines (Phase 42): the name without its
 * variant suffix — the variant has a line of its own now, and printing it
 * twice reads as two products — and "Goat's Milk · Vietnam" under it, without
 * the "Variant:" and "Market:" labels since Phase 44. A line
 * whose product is unknown (a scanned PO's unmatched row) keeps its printed
 * description and no caption.
 */
export function describeLine(input: {
  name: string;
  variant: string | null | undefined;
  market: string | null | undefined;
}): { description: string; detailCaption: string } {
  const variant = input.variant?.trim() || null;
  const market = input.market?.trim() || null;
  return {
    description: groupName({ name: input.name, variant }),
    detailCaption: [variant, market].filter(Boolean).join(" · "),
  };
}

/**
 * Builds the document from what the review screen already holds.
 *
 * Every argument is data the client has either chosen or been shown, so the
 * preview is not an approximation of the purchase order — it is the purchase
 * order, drawn before it is committed.
 */
export function buildPoDocument(input: {
  lines: CartLine[];
  subtotal: string;
  buyer: ReviewBuyer | null;
  /** The client's own PO number, when they typed one. */
  poNumber: string | null;
  /** Our Order ID, `W-…`, minted when the cart was opened. */
  orderId: string | null;
  notes: string | null;
  paymentTerms: string | null;
  orderDate: string;
  currency?: string;
}): PoDocumentData {
  const lines = input.lines.map((line, index) => ({
    position: index + 1,
    sku: line.sku,
    ...describeLine(line),
    ...documentQuantities(line.packSize, line.cartonsPerPallet, line.cartons),
    unitPrice: line.unitPrice,
    amount: line.amount,
  }));

  // Summed from the lines rather than echoed back, so a document whose rows
  // do not add up to its own total is impossible to render.
  const summed = lines
    .reduce((total, line) => total.plus(new Prisma.Decimal(line.amount)), new Prisma.Decimal(0))
    .toFixed(2);

  return {
    orderId: input.orderId,
    poNumber: input.poNumber?.trim() || null,
    orderDate: input.orderDate,
    // A cart has nothing promised yet; the team settles it when they confirm.
    deliveryDate: null,
    awaitingConfirmation: true,
    paymentTerms: input.paymentTerms?.trim() || null,
    currency: input.currency ?? "MYR",
    buyer: {
      name: input.buyer?.name ?? "—",
      address: input.buyer?.address ?? null,
      contact: joinContact(input.buyer?.contactName ?? null, input.buyer?.email ?? null),
    },
    lines,
    subtotal: summed,
    // A cart quotes no tax. Delivery and any tax are settled when the team
    // confirms, which the review screen says beside the button.
    tax: null,
    total: summed,
    notes: input.notes?.trim() || null,
  };
}

/**
 * The same document, drawn from an order that already exists (Phase 35).
 *
 * The checkout builder above takes a cart; this one takes a stored order, so a
 * buyer opening `/orders/{id}` months later reads the document their order
 * actually is rather than a summary of it. Both return `PoDocumentData` and
 * both are drawn by one `PurchaseOrderPreview`, which is the point: there is
 * one purchase order, not a checkout version and a history version that can
 * drift apart.
 *
 * Pure, like its sibling — the caller does the database read and the date
 * formatting, and passes strings.
 *
 * **The total is still summed from the lines, not echoed from the order.** A
 * confirmed purchase order carries its own `total`, and where the two disagree
 * the caller finds out through `documentAgreesWithOrder` instead of the
 * document quietly printing a figure its own rows contradict.
 */
export function buildPoDocumentFromOrder(input: {
  order: {
    /** Our Order ID; null for a purchase order uploaded as a scan. */
    orderId: string | null;
    /** The buyer's own PO number; null where they gave none. */
    poNumber: string | null;
    currency: string;
    paymentTerms: string | null;
    notes: string | null;
    /** `"0.00"` and null both print nothing. */
    tax: string | null;
    buyer: PoDocumentParty;
    lines: {
      position: number;
      sku: string;
      description: string;
      /** From the linked product. Absent or null prints no caption. */
      variant?: string | null;
      market?: string | null;
      /** From the linked product, or the line's own snapshot. */
      packSize: number | null;
      cartonsPerPallet: number | null;
      quantity: string;
      unitPrice: string;
      amount: string;
    }[];
  };
  /** Already formatted, so the page and the document agree on the day. */
  orderDate: string;
  /** Already formatted too. Null until the team has confirmed the order. */
  deliveryDate?: string | null;
  /** Submitted or received, not yet confirmed or declined. */
  awaitingConfirmation: boolean;
}): PoDocumentData {
  const { order } = input;
  const lines = order.lines.map((line) => ({
    position: line.position,
    sku: line.sku,
    ...describeLine({
      name: line.description,
      variant: line.variant,
      market: line.market,
    }),
    ...documentQuantities(line.packSize, line.cartonsPerPallet, Number(line.quantity)),
    unitPrice: line.unitPrice,
    amount: line.amount,
  }));

  const summed = lines.reduce(
    (total, line) => total.plus(new Prisma.Decimal(line.amount)),
    new Prisma.Decimal(0),
  );
  // A zero tax is no tax: printing a "Tax 0.00" row on a document that never
  // had any reads as a charge the buyer has to check.
  const tax = order.tax === null ? null : new Prisma.Decimal(order.tax);
  const taxed = tax === null || tax.isZero() ? null : tax;

  return {
    orderId: order.orderId,
    poNumber: order.poNumber?.trim() || null,
    orderDate: input.orderDate,
    deliveryDate: input.deliveryDate ?? null,
    awaitingConfirmation: input.awaitingConfirmation,
    paymentTerms: order.paymentTerms?.trim() || null,
    currency: order.currency,
    buyer: order.buyer,
    lines,
    subtotal: summed.toFixed(2),
    tax: taxed?.toFixed(2) ?? null,
    total: summed.plus(taxed ?? 0).toFixed(2),
    notes: order.notes?.trim() || null,
  };
}

/**
 * Whether the document's own arithmetic agrees with the figure the order will
 * be submitted at. Exported so the review screen can refuse to draw a
 * purchase order that contradicts the total beside its Confirm button, rather
 * than letting a buyer approve a document that is wrong.
 */
export const documentAgreesWithOrder = (
  document: PoDocumentData,
  subtotal: string,
): boolean => new Prisma.Decimal(document.total).equals(new Prisma.Decimal(subtotal));

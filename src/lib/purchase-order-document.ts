// The *browser* entry, not "@/generated/prisma/client": this module is
// imported by `ReviewSendForm`, a client component, and the full client drags
// the Prisma runtime into the browser bundle — which fails to chunk at all
// ("the chunking context does not support external modules: node:module").
// Only `Decimal` is wanted here, and the browser entry carries it. The same
// import is already used by the shop's product page.
import { Prisma } from "@/generated/prisma/browser";
import { formatGrouped } from "@/lib/money";
import { groupName } from "@/lib/product-groups";
import type { CartLine } from "@/lib/queries/cart";
import type { ReviewBuyer } from "@/lib/queries/shop-checkout";
import type { SupplierDetails } from "@/lib/org-settings";

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
 * The seller named on the document (Phase 42): its masthead, and the supplier
 * block wherever `/admin` holds no name. The shop and the portal keep "Zen
 * Garden" as their wordmark; a purchase order carries the registered company.
 */
export const DOCUMENT_COMPANY_NAME = "ZEN GARDEN TRADING (M) SDN BHD";

export type PoDocumentLine = {
  position: number;
  /** The seller's code. A shop order has no buyer-printed code to show. */
  sku: string;
  /** The product's name with its own " — Variant" suffix taken off. */
  description: string;
  /** "Goat's Milk · Vietnam". Empty where neither is known. */
  detailCaption: string;
  /**
   * "6 pieces/carton · 52 cartons/pallet · 1,200 pieces". A figure the
   * product does not carry is left out rather than printed as a blank.
   */
  packCaption: string;
  cartons: number;
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
  /** What the buyer will quote: their own PO number, else our reference. */
  reference: string;
  /** Always shown in the footer, even when `reference` is the buyer's own. */
  ourReference: string | null;
  orderDate: string;
  /**
   * The day the team committed to (Phase 38). Null on a cart and on an order
   * still waiting, and the cell then reads "—" (Phase 44, at the user's
   * request — until then it was not drawn at all). The stored PDF is redrawn
   * when the team confirms, so the date replaces the dash.
   */
  deliveryDate: string | null;
  paymentTerms: string | null;
  currency: string;
  buyer: PoDocumentParty;
  supplier: PoDocumentParty;
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
 * "6 pieces/carton · 52 cartons/pallet · 1,200 pieces" (Phase 44), in that
 * order, grouped the way every figure on the document is. Shared by both
 * builders and by the buyer's order query, so a cart and a stored order
 * caption their pack identically.
 *
 * "Carton" is written out rather than taken from `unit`: a product's pack size
 * *is* its pieces per carton, and a scanned line's unit arrives however the
 * customer typed it ("Carton", "CTN"). A figure the product does not carry is
 * left out, as a missing market already is.
 */
export function documentPackCaption(
  packSize: number | null,
  unit: string | null,
  cartons: number,
  cartonsPerPallet: number | null = null,
): string {
  if (!unit) return "";
  return [
    packSize === null ? null : `${formatGrouped(packSize, 0)} pieces/carton`,
    cartonsPerPallet === null
      ? null
      : `${formatGrouped(cartonsPerPallet, 0)} cartons/pallet`,
    packSize === null ? null : `${formatGrouped(packSize * cartons, 0)} pieces`,
  ]
    .filter(Boolean)
    .join(" · ");
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

const supplierParty = (supplier: SupplierDetails): PoDocumentParty => ({
  name: supplier.name ?? DOCUMENT_COMPANY_NAME,
  address: supplier.address ?? null,
  contact: joinContact(supplier.email, supplier.phone),
});

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
  supplier: SupplierDetails;
  /** The client's own PO number, when they typed one. */
  buyerReference: string | null;
  /** Our `W-…`, minted when the cart was opened. */
  ourReference: string | null;
  notes: string | null;
  paymentTerms: string | null;
  orderDate: string;
  currency?: string;
}): PoDocumentData {
  const lines = input.lines.map((line, index) => ({
    position: index + 1,
    sku: line.sku,
    ...describeLine(line),
    packCaption: documentPackCaption(
      line.packSize,
      line.unit,
      line.cartons,
      line.cartonsPerPallet,
    ),
    cartons: line.cartons,
    unitPrice: line.unitPrice,
    amount: line.amount,
  }));

  // Summed from the lines rather than echoed back, so a document whose rows
  // do not add up to its own total is impossible to render.
  const summed = lines
    .reduce((total, line) => total.plus(new Prisma.Decimal(line.amount)), new Prisma.Decimal(0))
    .toFixed(2);

  return {
    reference: input.buyerReference?.trim() || input.ourReference || "—",
    ourReference: input.ourReference,
    orderDate: input.orderDate,
    // A cart has nothing promised yet; the team settles it when they confirm.
    deliveryDate: null,
    paymentTerms: input.paymentTerms?.trim() || null,
    currency: input.currency ?? "MYR",
    buyer: {
      name: input.buyer?.name ?? "—",
      address: input.buyer?.address ?? null,
      contact: joinContact(input.buyer?.contactName ?? null, input.buyer?.email ?? null),
    },
    supplier: supplierParty(input.supplier),
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
    reference: string;
    buyerReference: string | null;
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
      packCaption: string;
      quantity: string;
      unitPrice: string;
      amount: string;
    }[];
  };
  supplier: SupplierDetails;
  /** Already formatted, so the page and the document agree on the day. */
  orderDate: string;
  /** Already formatted too. Null until the team has confirmed the order. */
  deliveryDate?: string | null;
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
    packCaption: line.packCaption,
    cartons: Number(line.quantity),
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
    // `reference` on a confirmed order is already the PO number, which may be
    // the buyer's own. Preferring `buyerReference` where there is one keeps the
    // masthead reading the same number it did at checkout.
    reference: order.buyerReference?.trim() || order.reference,
    ourReference: order.reference,
    orderDate: input.orderDate,
    deliveryDate: input.deliveryDate ?? null,
    paymentTerms: order.paymentTerms?.trim() || null,
    currency: order.currency,
    buyer: order.buyer,
    supplier: supplierParty(input.supplier),
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

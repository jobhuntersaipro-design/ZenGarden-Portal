// The *browser* entry, not "@/generated/prisma/client": this module is
// imported by `ReviewSendForm`, a client component, and the full client drags
// the Prisma runtime into the browser bundle — which fails to chunk at all
// ("the chunking context does not support external modules: node:module").
// Only `Decimal` is wanted here, and the browser entry carries it. The same
// import is already used by the shop's product page.
import { Prisma } from "@/generated/prisma/browser";
import { unitLabel } from "@/lib/cartons";
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
 */

export type PoDocumentLine = {
  position: number;
  /** The seller's code. A shop order has no buyer-printed code to show. */
  sku: string;
  description: string;
  /** "6 per carton · 18 pieces", or just the pack where pieces are unknown. */
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
  /** `null` prints as an em dash: the buyer asked for no particular day. */
  requestedDate: string | null;
  paymentTerms: string | null;
  currency: string;
  buyer: PoDocumentParty;
  supplier: PoDocumentParty;
  lines: PoDocumentLine[];
  subtotal: string;
  total: string;
  notes: string | null;
};

const joinContact = (name: string | null, email: string | null): string | null => {
  const parts = [name, email].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
};

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
  /** `yyyy-MM-dd`, or null when they asked for no particular day. */
  requestedDate: string | null;
  notes: string | null;
  paymentTerms: string | null;
  orderDate: string;
  currency?: string;
}): PoDocumentData {
  const lines = input.lines.map((line, index) => ({
    position: index + 1,
    sku: line.sku,
    description: line.name,
    packCaption: [
      unitLabel(line.packSize, line.unit),
      line.pieces === null ? null : `${line.pieces} pieces`,
    ]
      .filter(Boolean)
      .join(" · "),
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
    requestedDate: input.requestedDate,
    paymentTerms: input.paymentTerms?.trim() || null,
    currency: input.currency ?? "MYR",
    buyer: {
      name: input.buyer?.name ?? "—",
      address: input.buyer?.address ?? null,
      contact: joinContact(input.buyer?.contactName ?? null, input.buyer?.email ?? null),
    },
    supplier: {
      name: input.supplier.name ?? "Loving Hands",
      address: input.supplier.address ?? null,
      contact: joinContact(input.supplier.email, input.supplier.phone),
    },
    lines,
    subtotal: summed,
    total: summed,
    notes: input.notes?.trim() || null,
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

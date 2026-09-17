import { describe, expect, it } from "vitest";
import {
  buildPoDocument,
  buildPoDocumentFromOrder,
  documentAgreesWithOrder,
} from "@/lib/purchase-order-document";
import type { CartLine } from "@/lib/queries/cart";

type StoredOrder = Parameters<typeof buildPoDocumentFromOrder>[0]["order"];
type StoredLine = StoredOrder["lines"][number];

const line = (over: Partial<CartLine> = {}): CartLine => ({
  productId: "p1",
  sku: "ZEN-SC-2100-GM",
  name: "ZEN 2.1L — Goat's Milk",
  brand: "Zen Garden",
  variant: "Goat's Milk",
  market: "Vietnam",
  packSize: 6,
  cartonsPerPallet: 52,
  unit: "carton",
  cartons: 3,
  unitPrice: "225.50",
  amount: "676.50",
  pieces: 18,
  imageUrl: null,
  unavailable: false,
  ...over,
});

const supplier = {
  name: "Zen Garden",
  address: "1 Jalan Satu",
  email: "orders@lovinghands.my",
  phone: "+60 3-0000 0000",
};

const buyer = {
  name: "Acme Industrial Sdn Bhd",
  address: "12 Jalan Perindustrian 4\n47100 Puchong",
  contactName: "Aisha Rahman",
  email: "aisha@acme.test",
  paymentTerms: "30 days",
};

const build = (over: Partial<Parameters<typeof buildPoDocument>[0]> = {}) =>
  buildPoDocument({
    lines: [line()],
    subtotal: "676.50",
    buyer,
    supplier,
    buyerReference: null,
    ourReference: "W-2609-00007",
    notes: null,
    paymentTerms: "30 days",
    orderDate: "14 Sep 2026",
    ...over,
  });

describe("buildPoDocument", () => {
  it("totals the document from its own lines", () => {
    const doc = build({
      lines: [line(), line({ productId: "p2", sku: "ZEN-LV", amount: "756.00", cartons: 4 })],
      subtotal: "1432.50",
    });
    expect(doc.subtotal).toBe("1432.50");
    expect(doc.total).toBe("1432.50");
  });

  it("agrees to the cent with the figure the order is submitted at", () => {
    const doc = build({
      lines: [line({ amount: "676.50" }), line({ productId: "p2", amount: "158.40" })],
      subtotal: "834.90",
    });
    expect(documentAgreesWithOrder(doc, "834.90")).toBe(true);
  });

  it("reports a disagreement rather than drawing a document that contradicts the order", () => {
    const doc = build({ lines: [line({ amount: "676.50" })], subtotal: "999.99" });
    expect(documentAgreesWithOrder(doc, "999.99")).toBe(false);
  });

  it("prints the buyer's own PO number as the reference when they gave one", () => {
    const doc = build({ buyerReference: "ACME-PO-771" });
    expect(doc.reference).toBe("ACME-PO-771");
    // Ours still appears in the footer: it is what we file the order under.
    expect(doc.ourReference).toBe("W-2609-00007");
  });

  it("falls back to our reference when the buyer has no PO number", () => {
    expect(build({ buyerReference: "   " }).reference).toBe("W-2609-00007");
  });

  it("numbers the lines from one and carries the pack caption", () => {
    const doc = build();
    expect(doc.lines[0].position).toBe(1);
    // Pieces per carton, then cartons per pallet, then the line's pieces.
    expect(doc.lines[0].packCaption).toBe(
      "6 pieces/carton · 52 cartons/pallet · 18 pieces",
    );
  });

  it("groups the thousands in the pack caption", () => {
    const doc = build({
      lines: [line({ packSize: 1200, cartonsPerPallet: 1500, cartons: 3, pieces: 3600 })],
    });
    expect(doc.lines[0].packCaption).toBe(
      "1,200 pieces/carton · 1,500 cartons/pallet · 3,600 pieces",
    );
  });

  it("leaves the pallet figure out where the product has none", () => {
    const doc = build({ lines: [line({ cartonsPerPallet: null })] });
    expect(doc.lines[0].packCaption).toBe("6 pieces/carton · 18 pieces");
  });

  it("writes carton in lower case whatever the line's unit says", () => {
    const doc = build({ lines: [line({ unit: "Carton" })] });
    expect(doc.lines[0].packCaption).toBe(
      "6 pieces/carton · 52 cartons/pallet · 18 pieces",
    );
  });

  it("takes the variant off the name and prints it with the market underneath, unlabelled", () => {
    const doc = build();
    expect(doc.lines[0].description).toBe("ZEN 2.1L");
    expect(doc.lines[0].detailCaption).toBe("Goat's Milk · Vietnam");
  });

  it("prints only what the product knows of its variant and market", () => {
    expect(build({ lines: [line({ market: null })] }).lines[0].detailCaption).toBe(
      "Goat's Milk",
    );
    const bare = build({ lines: [line({ variant: null, market: null })] }).lines[0];
    expect(bare.description).toBe("ZEN 2.1L — Goat's Milk");
    expect(bare.detailCaption).toBe("");
  });

  it("leaves the pieces off a line whose pack size is unknown", () => {
    const doc = build({ lines: [line({ packSize: null, pieces: null })] });
    expect(doc.lines[0].packCaption).toBe("52 cartons/pallet");
  });

  it("joins each party's contact, and omits it when there is nothing to join", () => {
    expect(build().buyer.contact).toBe("Aisha Rahman · aisha@acme.test");
    expect(
      build({ buyer: { ...buyer, contactName: null, email: null } }).buyer.contact,
    ).toBeNull();
  });

  it("survives a buyer that could not be read", () => {
    const doc = build({ buyer: null });
    expect(doc.buyer).toEqual({ name: "—", address: null, contact: null });
  });

  it("falls back to a supplier name when the org settings hold none", () => {
    const doc = build({ supplier: { ...supplier, name: null } });
    expect(doc.supplier.name).toBe("ZEN GARDEN TRADING (M) SDN BHD");
  });

  it("treats blank notes and blank payment terms as absent", () => {
    const doc = build({ notes: "   ", paymentTerms: "  " });
    expect(doc.notes).toBeNull();
    expect(doc.paymentTerms).toBeNull();
  });

  it("keeps the currency at MYR unless told otherwise", () => {
    expect(build().currency).toBe("MYR");
  });
});

describe("buildPoDocumentFromOrder", () => {
  const storedLine = (over: Partial<StoredLine> = {}): StoredLine => ({
    position: 1,
    sku: "ZEN-SC-2100-GM",
    description: "ZEN 2.1L — Goat's Milk",
    packCaption: "6 per carton · 18 pieces",
    quantity: "3",
    unitPrice: "225.50",
    amount: "676.50",
    ...over,
  });

  const order = (over: Partial<StoredOrder> = {}): StoredOrder => ({
    reference: "W-2609-00005",
    buyerReference: null,
    currency: "MYR",
    paymentTerms: "30 days",
    notes: null,
    tax: null,
    buyer: {
      name: "Acme Industrial Sdn Bhd",
      address: "12 Jalan Perindustrian 4",
      contact: "Aisha Rahman · aisha@acme.test",
    },
    lines: [storedLine()],
    ...over,
  });

  const fromOrder = (over: Partial<StoredOrder> = {}) =>
    buildPoDocumentFromOrder({
      order: order(over),
      supplier,
      orderDate: "15 Sep 2026",
    });

  it("totals from its own lines rather than from anything handed to it", () => {
    const doc = fromOrder({
      lines: [
        storedLine({ amount: "676.50" }),
        storedLine({ position: 2, amount: "210.00" }),
      ],
    });
    expect(doc.subtotal).toBe("886.50");
    expect(doc.total).toBe("886.50");
  });

  /**
   * The reason the checkout builder and this one both exist: a buyer opening an
   * order months later must read the same masthead they confirmed, so their own
   * PO number wins over our reference where they gave one — and our reference
   * is still printed underneath either way.
   */
  it("prints the buyer's own number where they gave one, and ours regardless", () => {
    expect(fromOrder({ buyerReference: "ACME-771" }).reference).toBe("ACME-771");
    expect(fromOrder({ buyerReference: "ACME-771" }).ourReference).toBe(
      "W-2609-00005",
    );
    expect(fromOrder().reference).toBe("W-2609-00005");
  });

  it("treats a blank buyer reference as none at all", () => {
    expect(fromOrder({ buyerReference: "   " }).reference).toBe("W-2609-00005");
  });

  /**
   * A shop order quotes no tax and a zero is not a tax: a "Tax 0.00" row reads
   * as a charge the buyer has to check.
   */
  it("prints no tax row for an order with none", () => {
    expect(fromOrder({ tax: null }).tax).toBeNull();
    expect(fromOrder({ tax: "0.00" }).tax).toBeNull();
    expect(fromOrder({ tax: "0.00" }).total).toBe("676.50");
  });

  /**
   * A purchase order read off a customer's own document can carry tax, and the
   * document has to add it — otherwise it prints a total the buyer does not owe
   * and `documentAgreesWithOrder` refuses to draw a perfectly good order.
   */
  it("adds a real tax to the total and still agrees with the order", () => {
    const doc = fromOrder({ tax: "40.59" });
    expect(doc.subtotal).toBe("676.50");
    expect(doc.tax).toBe("40.59");
    expect(doc.total).toBe("717.09");
    expect(documentAgreesWithOrder(doc, "717.09")).toBe(true);
  });

  it("refuses an order whose lines do not reach its own total", () => {
    expect(documentAgreesWithOrder(fromOrder(), "999.00")).toBe(false);
  });

  it("captions a stored line from its product, and a scanned line without one as printed", () => {
    const linked = fromOrder({
      lines: [storedLine({ variant: "Goat's Milk", market: "Iraq" })],
    }).lines[0];
    expect(linked.description).toBe("ZEN 2.1L");
    expect(linked.detailCaption).toBe("Goat's Milk · Iraq");

    const scanned = fromOrder({ lines: [storedLine()] }).lines[0];
    expect(scanned.description).toBe("ZEN 2.1L — Goat's Milk");
    expect(scanned.detailCaption).toBe("");
  });

  it("carries the expected delivery date only when one is given", () => {
    expect(fromOrder().deliveryDate).toBeNull();
    expect(
      buildPoDocumentFromOrder({
        order: order(),
        supplier,
        orderDate: "15 Sep 2026",
        deliveryDate: "2 Oct 2026",
      }).deliveryDate,
    ).toBe("2 Oct 2026");
  });

  it("keeps the order's own currency rather than assuming MYR", () => {
    expect(fromOrder({ currency: "SGD" }).currency).toBe("SGD");
  });

  it("passes the buyer through exactly as the order holds them", () => {
    expect(fromOrder().buyer).toEqual({
      name: "Acme Industrial Sdn Bhd",
      address: "12 Jalan Perindustrian 4",
      contact: "Aisha Rahman · aisha@acme.test",
    });
  });
});

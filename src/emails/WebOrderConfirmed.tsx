import { Layout } from "@/emails/Layout";
import { ButtonLink, Heading, Paragraph } from "@/emails/parts";
import { PoFooter, PoMetaLine, PoPreview, PoSummary } from "@/emails/po-parts";
import type { PoDocumentData } from "@/lib/purchase-order-document";

export type WebOrderConfirmedProps = {
  /** Our Order ID, `W-2609-00014`. */
  reference: string;
  /** The buyer's own PO number, when they gave one. Never the Order ID. */
  buyerReference: string | null;
  /** Already formatted — "2 Oct 2026" — so the email and the screen agree. */
  expectedDelivery: string;
  lineCount: number;
  total: string;
  orderUrl: string;
  /**
   * True when the date has moved on an order already confirmed. The same
   * facts, but the subject and the opening line say so — a buyer who has
   * planned around the first date must not have to compare two emails to
   * notice the difference.
   */
  updated?: boolean;
  /**
   * True when the redrawn purchase order is on the email (Phase 42). Said only
   * when it is, like the receipt: a render can fail while the confirmation
   * itself is fine.
   */
  attached?: boolean;
  /**
   * The confirmed order's facts and lines (2026-09-18) — the price and the
   * date this email confirms. Null when they could not be read.
   */
  document?: PoDocumentData | null;
  /** Whether page 1 of the PDF is on the email as `cid:po-preview`. */
  preview?: boolean;
};

/**
 * The team has accepted a shop order and committed to a delivery date
 * (Phase 38).
 *
 * The buyer's only signal used to be visiting the shop: confirming sent no
 * email at all. This is that gap closed, and the date is the point of it —
 * it is in the subject, so it is legible in an inbox without opening
 * anything.
 */
export function WebOrderConfirmed({
  reference,
  buyerReference,
  expectedDelivery,
  lineCount,
  total,
  orderUrl,
  updated = false,
  attached = false,
  document = null,
  preview = false,
}: WebOrderConfirmedProps) {
  return (
    <Layout>
      <Heading>
        {updated
          ? `Delivery of order ${reference} has moved to ${expectedDelivery}`
          : `Order ${reference} is confirmed`}
      </Heading>
      <PoMetaLine
        reference={reference}
        lineCount={lineCount}
        total={total}
        buyerReference={buyerReference}
        audience="buyer"
      />
      <Paragraph>
        {updated
          ? `We have had to change the delivery date on order ${reference}. It is now expected on ${expectedDelivery}. Nothing else on the order has changed.`
          : `We have accepted your order at ${total} and expect to deliver it on ${expectedDelivery}.`}
      </Paragraph>
      {attached ? (
        <Paragraph>
          Your purchase order, showing the expected delivery date, is attached to
          this email.
        </Paragraph>
      ) : null}
      {document ? (
        <PoSummary
          document={document}
          heading={updated ? "Your order" : "What we confirmed"}
        />
      ) : null}
      <PoPreview reference={reference} orderUrl={orderUrl} preview={preview} attached={attached} />
      <ButtonLink href={orderUrl}>See your order</ButtonLink>
      <PoFooter />
    </Layout>
  );
}

/** The date is in the subject: an inbox should not need to be opened to read it. */
export const webOrderConfirmedSubject = (
  reference: string,
  expectedDelivery: string,
  updated = false,
) =>
  updated
    ? `Updated: order ${reference} · delivery now expected ${expectedDelivery}`
    : `Order ${reference} confirmed · delivery expected ${expectedDelivery}`;

export default WebOrderConfirmed;

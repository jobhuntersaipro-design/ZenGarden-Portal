import { Layout, type PartnerLogo } from "@/emails/Layout";
import { ButtonLink, Heading, Paragraph } from "@/emails/parts";
import { PoFooter, PoMetaLine, PoPreview, PoSummary } from "@/emails/po-parts";
import { emailOrderName } from "@/lib/order-identity";
import type { PoDocumentData } from "@/lib/purchase-order-document";

export type WebOrderConfirmedProps = {
  /** The buyer's logo beside ours in the header; null when they have none. */
  buyerLogo?: PartnerLogo | null;
  /** Our Order ID, `W-2609-00014`. */
  reference: string;
  /**
   * The buyer's own PO number (2026-09-20). Names the order in the subject,
   * heading and opening line, falling back to `reference`; shown labelled, or
   * "—", by `PoMetaLine`.
   */
  poNumber?: string | null;
  /** Already formatted — "2 Oct 2026" — so the email and the screen agree. */
  expectedDelivery: string;
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
  buyerLogo,
  reference,
  poNumber = null,
  expectedDelivery,
  total,
  orderUrl,
  updated = false,
  attached = false,
  document = null,
  preview = false,
}: WebOrderConfirmedProps) {
  const name = emailOrderName(poNumber, reference);
  return (
    <Layout partnerLogo={buyerLogo}>
      <Heading>
        {updated
          ? `Delivery of order ${name} has moved to ${expectedDelivery}`
          : `Order ${name} is confirmed`}
      </Heading>
      <PoMetaLine poNumber={poNumber} />
      <Paragraph>
        {updated
          ? `We have had to change the delivery date on order ${name}. It is now expected on ${expectedDelivery}. Nothing else on the order has changed.`
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
  poNumber: string | null,
  reference: string,
  expectedDelivery: string,
  updated = false,
) => {
  const name = emailOrderName(poNumber, reference);
  return updated
    ? `Updated: order ${name} · delivery now expected ${expectedDelivery}`
    : `Order ${name} confirmed · delivery expected ${expectedDelivery}`;
};

export default WebOrderConfirmed;

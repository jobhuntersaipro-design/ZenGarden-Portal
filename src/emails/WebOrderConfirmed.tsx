import { Layout } from "@/emails/Layout";
import { ButtonLink, Heading, Mono, Paragraph } from "@/emails/parts";

export type WebOrderConfirmedProps = {
  reference: string;
  buyerReference: string | null;
  /** The PO number the team gave it, which may be the buyer's own. */
  poNumber: string;
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
  poNumber,
  expectedDelivery,
  lineCount,
  total,
  orderUrl,
  updated = false,
}: WebOrderConfirmedProps) {
  return (
    <Layout>
      <Heading>
        {updated
          ? `Your delivery date has moved to ${expectedDelivery}`
          : `Order ${reference} is confirmed`}
      </Heading>
      <Paragraph>
        {updated
          ? `We have had to change the delivery date on order ${reference}. It is now expected on ${expectedDelivery}.`
          : `We have accepted your order and expect to deliver it on ${expectedDelivery}.`}
      </Paragraph>
      <Paragraph muted>
        {`${lineCount} line${lineCount === 1 ? "" : "s"} · ${total} · our reference `}
        <Mono>{poNumber}</Mono>
        {buyerReference ? " · your reference " : ""}
        {buyerReference ? <Mono>{buyerReference}</Mono> : null}
      </Paragraph>
      <ButtonLink href={orderUrl}>See your order</ButtonLink>
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

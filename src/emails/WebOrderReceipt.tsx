import { Layout } from "@/emails/Layout";
import { ButtonLink, Heading, Paragraph } from "@/emails/parts";

export type WebOrderReceiptProps = {
  reference: string;
  buyerReference: string | null;
  lineCount: number;
  total: string;
  orderUrl: string;
  /**
   * Whether the purchase order is on this email (Phase 37). Said only when
   * true: a line promising an attachment that is not there is worse than no
   * line, and the render can fail while the order is perfectly fine.
   */
  attached?: boolean;
};

/**
 * The client's own copy of an order they just sent (Phase 32). The ops team
 * gets `WebOrderPlaced`; this is the other half, and the sent screen promises
 * it by name, so the two must not drift apart.
 *
 * It states plainly that nothing is charged and nothing ships yet, because
 * the price and the delivery date are both still ours to confirm.
 */
export function WebOrderReceipt({
  reference,
  buyerReference,
  lineCount,
  total,
  orderUrl,
  attached = false,
}: WebOrderReceiptProps) {
  return (
    <Layout>
      <Heading>{`We have your order ${reference}`}</Heading>
      <Paragraph>
        {`${lineCount} line${lineCount === 1 ? "" : "s"} · ${total}`}
        {buyerReference ? ` · your PO number ${buyerReference}` : ""}
      </Paragraph>
      {attached ? (
        <Paragraph>Your purchase order is attached to this email.</Paragraph>
      ) : null}
      <Paragraph>
        Our team reviews every order and will confirm the price and the delivery
        date with you. Nothing is charged and nothing ships until they do.
      </Paragraph>
      <ButtonLink href={orderUrl}>See your order</ButtonLink>
    </Layout>
  );
}

export const webOrderReceiptSubject = (reference: string) =>
  `We have your order ${reference}`;

export default WebOrderReceipt;

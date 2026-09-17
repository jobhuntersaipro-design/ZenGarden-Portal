import { Layout } from "@/emails/Layout";
import { ButtonLink, Heading, Paragraph } from "@/emails/parts";
import { PoFooter, PoMetaLine, PoPreview, PoSummary } from "@/emails/po-parts";
import type { PoDocumentData } from "@/lib/purchase-order-document";

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
  /** The order's facts and lines (2026-09-18). Null when they could not be read. */
  document?: PoDocumentData | null;
  /** Whether page 1 of the PDF is on the email as `cid:po-preview`. */
  preview?: boolean;
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
  document = null,
  preview = false,
}: WebOrderReceiptProps) {
  return (
    <Layout>
      <Heading>{`We have your order ${reference}`}</Heading>
      <PoMetaLine
        reference={reference}
        lineCount={lineCount}
        total={total}
        buyerReference={buyerReference}
        audience="buyer"
      />
      {attached ? (
        <Paragraph>Your purchase order is attached to this email.</Paragraph>
      ) : null}
      <Paragraph>
        Our team reviews every order and will confirm the price and the delivery
        date with you. Nothing is charged and nothing ships until they do.
      </Paragraph>
      {document ? <PoSummary document={document} heading="Your order" /> : null}
      <PoPreview reference={reference} orderUrl={orderUrl} preview={preview} attached={attached} />
      <ButtonLink href={orderUrl}>See your order</ButtonLink>
      <PoFooter />
    </Layout>
  );
}

export const webOrderReceiptSubject = (reference: string) =>
  `We have your order ${reference}`;

export default WebOrderReceipt;

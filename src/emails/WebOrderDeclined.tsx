import { Layout } from "@/emails/Layout";
import { ButtonLink, Heading, Paragraph } from "@/emails/parts";
import { PoFooter, PoMetaLine, PoPreview, PoSummary } from "@/emails/po-parts";
import { emailOrderName } from "@/lib/order-identity";
import type { PoDocumentData } from "@/lib/purchase-order-document";

export type WebOrderDeclinedProps = {
  reference: string;
  /**
   * The buyer's own PO number (2026-09-20). Names the order in the subject and
   * heading, falling back to `reference`; shown labelled, or "—", by
   * `PoMetaLine`.
   */
  poNumber?: string | null;
  /** The reason the reviewer typed. Required of them, and shown verbatim. */
  reason: string;
  orderUrl: string;
  /** What the buyer sent (2026-09-18). Null when it could not be read. */
  document?: PoDocumentData | null;
  /** Whether page 1 of the order as sent is on the email as `cid:po-preview`. */
  preview?: boolean;
  /** Whether the purchase order as sent is attached. */
  attached?: boolean;
};

/**
 * The team cannot accept an order (Phase 38).
 *
 * `declineWebOrder` has required a reason since Phase 16 on the grounds that
 * "the buyer sees this" — but until now the buyer only saw it if they went
 * looking. The reason is the whole message, quoted as written rather than
 * paraphrased, so the ops team's own words are what arrives.
 *
 * Below it, what the buyer sent (2026-09-18), so they can tell which order
 * this is about without opening the shop.
 *
 * The subject deliberately avoids "declined" or "rejected": a buyer scanning
 * an inbox should open this, not file it.
 */
export function WebOrderDeclined({
  reference,
  poNumber = null,
  reason,
  orderUrl,
  document = null,
  preview = false,
  attached = false,
}: WebOrderDeclinedProps) {
  return (
    <Layout>
      <Heading>{`About your order ${emailOrderName(poNumber, reference)}`}</Heading>
      <PoMetaLine poNumber={poNumber} />
      <Paragraph>
        We are sorry — we cannot take this order on as it stands.
      </Paragraph>
      <Paragraph>{reason}</Paragraph>
      <Paragraph muted>
        Nothing has been charged and nothing will be delivered against it. Reply
        to this email or call us and we will find a way through.
      </Paragraph>
      {document ? <PoSummary document={document} heading="What you sent" declined /> : null}
      <PoPreview reference={reference} orderUrl={orderUrl} preview={preview} attached={attached} />
      <ButtonLink href={orderUrl}>See your order</ButtonLink>
      <PoFooter />
    </Layout>
  );
}

export const webOrderDeclinedSubject = (poNumber: string | null, reference: string) =>
  `About your order ${emailOrderName(poNumber, reference)}`;

export default WebOrderDeclined;

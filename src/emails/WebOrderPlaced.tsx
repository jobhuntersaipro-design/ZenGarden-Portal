import { Layout } from "@/emails/Layout";
import { ButtonLink, Heading, Paragraph } from "@/emails/parts";
import { PoFooter, PoMetaLine, PoPreview, PoSummary } from "@/emails/po-parts";
import { emailOrderName } from "@/lib/order-identity";
import type { PoDocumentData } from "@/lib/purchase-order-document";

export type WebOrderPlacedProps = {
  reference: string;
  /**
   * The buyer's own PO number (2026-09-20). Names the order in the subject and
   * heading, falling back to `reference`; shown labelled, or "—", by
   * `PoMetaLine`.
   */
  poNumber?: string | null;
  buyerName: string;
  placedByName: string;
  reviewUrl: string;
  /** The order's facts and lines (2026-09-18). Null when they could not be read. */
  document?: PoDocumentData | null;
  /** Whether page 1 of the PDF is on the email as `cid:po-preview`. */
  preview?: boolean;
  /** Whether the PDF is on the email. */
  attached?: boolean;
};

/** The team's copy of a shop order: short, with the same document the buyer gets. */
export function WebOrderPlaced({
  reference,
  poNumber = null,
  buyerName,
  placedByName,
  reviewUrl,
  document = null,
  preview = false,
  attached = false,
}: WebOrderPlacedProps) {
  return (
    <Layout>
      <Heading>
        {`New order ${emailOrderName(poNumber, reference)} from ${buyerName}`}
      </Heading>
      <PoMetaLine poNumber={poNumber} />
      <Paragraph>
        {`${placedByName} at ${buyerName} placed an order on the shop.`}
      </Paragraph>
      {document ? <PoSummary document={document} heading="The order" /> : null}
      <PoPreview reference={reference} orderUrl={reviewUrl} preview={preview} attached={attached} />
      <ButtonLink href={reviewUrl}>Review the order</ButtonLink>
      <PoFooter />
    </Layout>
  );
}

/**
 * The order is named in the subject, so two orders from one buyer read apart.
 * The buyer's PO number since 2026-09-20, falling back to the Order ID.
 */
export const webOrderPlacedSubject = (
  buyerName: string,
  poNumber: string | null,
  reference: string,
) => `New order ${emailOrderName(poNumber, reference)} from ${buyerName}`;

export default WebOrderPlaced;

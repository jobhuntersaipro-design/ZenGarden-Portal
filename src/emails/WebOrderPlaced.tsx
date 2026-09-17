import { Layout } from "@/emails/Layout";
import { ButtonLink, Heading, Paragraph } from "@/emails/parts";
import { PoFooter, PoMetaLine, PoPreview, PoSummary } from "@/emails/po-parts";
import type { PoDocumentData } from "@/lib/purchase-order-document";

export type WebOrderPlacedProps = {
  reference: string;
  buyerName: string;
  placedByName: string;
  lineCount: number;
  total: string;
  reviewUrl: string;
  /** The buyer's own PO number, when they gave one. */
  buyerReference?: string | null;
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
  buyerName,
  placedByName,
  lineCount,
  total,
  reviewUrl,
  buyerReference = null,
  document = null,
  preview = false,
  attached = false,
}: WebOrderPlacedProps) {
  return (
    <Layout>
      <Heading>{`New order ${reference} from ${buyerName}`}</Heading>
      <PoMetaLine
        reference={reference}
        lineCount={lineCount}
        total={total}
        buyerReference={buyerReference}
        audience="staff"
      />
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

/** The Order ID is in the subject, so two orders from one buyer read apart. */
export const webOrderPlacedSubject = (buyerName: string, reference: string) =>
  `New order ${reference} from ${buyerName}`;

export default WebOrderPlaced;

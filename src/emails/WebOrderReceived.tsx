import { Layout } from "@/emails/Layout";
import { ButtonLink, Heading, Mono, Paragraph } from "@/emails/parts";

export type WebOrderReceivedProps = {
  reference: string;
  buyerReference: string | null;
  lineCount: number;
  total: string;
  orderUrl: string;
};

/**
 * A person on the ops team has picked the order up (Phase 41).
 *
 * The third mail in the sequence — receipt, this, then confirmation. It
 * exists because the gap between "sent" and "confirmed with a date" can last
 * days, and nothing in the product used to say a human had seen the order.
 *
 * It deliberately promises no date: there is none yet, and inventing a
 * "soon" here would be contradicted by the confirmation mail that follows.
 */
export function WebOrderReceived({
  reference,
  buyerReference,
  lineCount,
  total,
  orderUrl,
}: WebOrderReceivedProps) {
  return (
    <Layout>
      <Heading>{`We have your order ${reference}`}</Heading>
      <Paragraph>
        Our team has your order and is working on it. We will confirm it with
        an expected delivery date shortly.
      </Paragraph>
      <Paragraph muted>
        {`${lineCount} line${lineCount === 1 ? "" : "s"} · ${total}`}
        {buyerReference ? " · your reference " : ""}
        {buyerReference ? <Mono>{buyerReference}</Mono> : null}
      </Paragraph>
      <ButtonLink href={orderUrl}>See your order</ButtonLink>
    </Layout>
  );
}

export const webOrderReceivedSubject = (reference: string) =>
  `We have your order ${reference}`;

export default WebOrderReceived;

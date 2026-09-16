import { Layout } from "@/emails/Layout";
import { ButtonLink, Heading, Paragraph } from "@/emails/parts";

export type WebOrderDeclinedProps = {
  reference: string;
  /** The reason the reviewer typed. Required of them, and shown verbatim. */
  reason: string;
  orderUrl: string;
};

/**
 * The team cannot accept an order (Phase 38).
 *
 * `declineWebOrder` has required a reason since Phase 16 on the grounds that
 * "the buyer sees this" — but until now the buyer only saw it if they went
 * looking. The reason is the whole message, quoted as written rather than
 * paraphrased, so the ops team's own words are what arrives.
 *
 * The subject deliberately avoids "declined" or "rejected": a buyer scanning
 * an inbox should open this, not file it.
 */
export function WebOrderDeclined({
  reference,
  reason,
  orderUrl,
}: WebOrderDeclinedProps) {
  return (
    <Layout>
      <Heading>{`About your order ${reference}`}</Heading>
      <Paragraph>
        We are sorry — we cannot take this order on as it stands.
      </Paragraph>
      <Paragraph>{reason}</Paragraph>
      <Paragraph muted>
        Nothing has been charged and nothing will be delivered against it. Reply
        to this email or call us and we will find a way through.
      </Paragraph>
      <ButtonLink href={orderUrl}>See your order</ButtonLink>
    </Layout>
  );
}

export const webOrderDeclinedSubject = (reference: string) =>
  `About your order ${reference}`;

export default WebOrderDeclined;

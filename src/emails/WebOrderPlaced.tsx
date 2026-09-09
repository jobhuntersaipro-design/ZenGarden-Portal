import { Layout } from "@/emails/Layout";
import { ButtonLink, Heading, Paragraph } from "@/emails/parts";

export type WebOrderPlacedProps = {
  reference: string;
  buyerName: string;
  placedByName: string;
  lineCount: number;
  total: string;
  reviewUrl: string;
};

export function WebOrderPlaced({
  reference,
  buyerName,
  placedByName,
  lineCount,
  total,
  reviewUrl,
}: WebOrderPlacedProps) {
  return (
    <Layout>
      <Heading>{`New order from ${buyerName}`}</Heading>
      <Paragraph>
        {`${placedByName} at ${buyerName} placed an order on the shop.`}
      </Paragraph>
      <Paragraph>
        {`${reference} · ${lineCount} line${lineCount === 1 ? "" : "s"} · ${total}`}
      </Paragraph>
      <ButtonLink href={reviewUrl}>Review the order</ButtonLink>
    </Layout>
  );
}

export const webOrderPlacedSubject = (buyerName: string) =>
  `New order from ${buyerName}`;

export default WebOrderPlaced;

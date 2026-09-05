import { Layout } from "@/emails/Layout";
import { Heading, Paragraph } from "@/emails/parts";

export type AccessDeclinedProps = {
  name: string;
};

/** Optional, sent only when the admin ticks the box on decline. No link. */
export function AccessDeclined({ name }: AccessDeclinedProps) {
  return (
    <Layout>
      <Heading>Your access request was declined</Heading>
      <Paragraph>
        {name}, your request to use the Loving Hands Portal was not approved.
        If you think that is a mistake, speak to your admin.
      </Paragraph>
    </Layout>
  );
}

export const accessDeclinedSubject = () =>
  "Your Loving Hands Portal access request";

export default AccessDeclined;

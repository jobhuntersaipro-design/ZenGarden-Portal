import { Layout } from "@/emails/Layout";
import { ButtonLink, Heading, Paragraph } from "@/emails/parts";

export type AccessApprovedProps = {
  name: string;
  signInUrl: string;
};

/** To the requester once a super admin approves them. */
export function AccessApproved({ name, signInUrl }: AccessApprovedProps) {
  return (
    <Layout>
      <Heading>You&rsquo;re in</Heading>
      <Paragraph>
        {name}, an admin has approved your access to the Zen Garden Portal.
        Sign in with the same Google account you used to request it.
      </Paragraph>
      <ButtonLink href={signInUrl}>Sign in</ButtonLink>
    </Layout>
  );
}

export const accessApprovedSubject = () =>
  "You're in — Zen Garden Portal access approved";

export default AccessApproved;

import { Layout } from "@/emails/Layout";
import { ButtonLink, Heading, Paragraph } from "@/emails/parts";

export type AccessRequestedProps = {
  name: string;
  email: string;
  adminUrl: string;
};

/** To every super admin, the first time an unknown Google account signs in. */
export function AccessRequested({ name, email, adminUrl }: AccessRequestedProps) {
  return (
    <Layout>
      <Heading>Someone is asking for access</Heading>
      <Paragraph>
        {name} ({email}) tried to sign in to the Loving Hands Portal with
        Google. They have no account yet, so nothing happened — approve them
        and they are in.
      </Paragraph>
      <ButtonLink href={adminUrl}>Review in admin</ButtonLink>
      <Paragraph muted>
        You are getting this because you are a super admin on the portal.
      </Paragraph>
    </Layout>
  );
}

export const accessRequestedSubject = (name: string) =>
  `Access request from ${name}`;

export default AccessRequested;

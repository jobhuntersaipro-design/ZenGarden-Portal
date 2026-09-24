import { Layout } from "@/emails/Layout";
import { ButtonLink, Heading, Mono, Paragraph } from "@/emails/parts";

export type InvitationProps = {
  name: string;
  setPasswordUrl: string;
  signInUrl: string;
};

/**
 * To a user an admin created (2026-09-24). No password travels in the email:
 * the link sets one, and a Google account on the same address works too.
 */
export function Invitation({ name, setPasswordUrl, signInUrl }: InvitationProps) {
  return (
    <Layout>
      <Heading>You&rsquo;ve been invited to the Zen Garden Portal</Heading>
      <Paragraph>
        {name}, an admin has created your account. Choose a password to sign in
        with — the link expires in 7 days and works once.
      </Paragraph>
      <ButtonLink href={setPasswordUrl}>Set your password</ButtonLink>
      <Paragraph muted>
        If the button does not work, paste this into your browser:{" "}
        <Mono style={{ fontSize: 12 }}>{setPasswordUrl}</Mono>
      </Paragraph>
      <Paragraph muted>
        If this address is a Google account, you can also{" "}
        <a href={signInUrl}>sign in with Google</a> instead.
      </Paragraph>
    </Layout>
  );
}

export const invitationSubject = () => "You're invited to the Zen Garden Portal";

export default Invitation;

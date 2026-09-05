import { Layout } from "@/emails/Layout";
import { ButtonLink, Heading, Mono, Paragraph } from "@/emails/parts";

export type PasswordResetProps = {
  name: string;
  resetUrl: string;
};

/** To the user, from the forgot-password form. Single use, 30 minutes. */
export function PasswordReset({ name, resetUrl }: PasswordResetProps) {
  return (
    <Layout>
      <Heading>Reset your password</Heading>
      <Paragraph>
        {name}, use the button below to set a new password for the Loving Hands
        Portal. The link expires in 30 minutes and works once.
      </Paragraph>
      <ButtonLink href={resetUrl}>Set a new password</ButtonLink>
      <Paragraph muted>
        If the button does not work, paste this into your browser:{" "}
        <Mono style={{ fontSize: 12 }}>{resetUrl}</Mono>
      </Paragraph>
      <Paragraph muted>
        If you did not ask for this, ignore this email — your password stays as
        it is.
      </Paragraph>
    </Layout>
  );
}

export const passwordResetSubject = () =>
  "Reset your Loving Hands Portal password";

export default PasswordReset;

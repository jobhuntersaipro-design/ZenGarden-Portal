import { Layout } from "@/emails/Layout";
import { ButtonLink, Heading, Mono, Paragraph, surfaceSoft } from "@/emails/parts";

export type TemporaryPasswordProps = {
  name: string;
  password: string;
  signInUrl: string;
};

/** To a user an admin created with a password (Phase 09). */
export function TemporaryPassword({
  name,
  password,
  signInUrl,
}: TemporaryPasswordProps) {
  return (
    <Layout>
      <Heading>Your Loving Hands Portal account</Heading>
      <Paragraph>
        {name}, an admin has created your account. Sign in with your email
        address and the temporary password below — you&rsquo;ll be asked to
        change it straight away.
      </Paragraph>
      <div
        style={{
          margin: "0 0 16px",
          padding: "14px 16px",
          borderRadius: 9,
          backgroundColor: surfaceSoft,
        }}
      >
        <Mono>{password}</Mono>
      </div>
      <ButtonLink href={signInUrl}>Sign in</ButtonLink>
    </Layout>
  );
}

export const temporaryPasswordSubject = () =>
  "Your Loving Hands Portal account";

export default TemporaryPassword;

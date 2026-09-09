import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-guards";
import { AuthCard } from "@/components/auth/AuthCard";
import { Notice } from "@/components/auth/Notice";
import { SignInForm } from "@/components/auth/SignInForm";

export const metadata: Metadata = { title: "Sign in · Loving Hands Portal" };

/**
 * `?next=` is attacker-controlled, so only a same-origin path is honoured.
 * `//host` and `/\host` are protocol-relative and would leave the site.
 */
function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

const ERRORS: Record<string, string> = {
  disabled: "This account is disabled. Ask your admin.",
  unverified: "Google could not verify that email address.",
  CredentialsSignin: "Wrong email or password.",
  use_password: "Use your email and password to sign in.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  // Checked here rather than in the proxy: this runs the `jwt` callback, so a
  // cookie whose session has since been disabled or bumped resolves to null and
  // the visitor gets the card instead of being bounced into a loop.
  const next = safeNext(first("next"));
  const signedIn = await getSessionUser();
  if (signedIn && !signedIn.mustChangePassword) redirect(next);

  const error = first("error");
  const message = error ? (ERRORS[error] ?? "We could not sign you in.") : null;

  // One card, two audiences. The route is shared because sign-in, reset and
  // the forced password change are the same flows on both hosts; only the
  // wording and the Google block differ.
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase();
  const isShop = Boolean(process.env.SHOP_HOST) &&
    host === process.env.SHOP_HOST?.trim().toLowerCase();

  return (
    <AuthCard
      title={isShop ? "Sign in to order" : "Sign in to Loving Hands"}
      subtitle={
        isShop
          ? "Browse the catalogue and place your order."
          : "Purchase-order intake for the ops team."
      }
    >
      {message ? (
        <div className="mt-lg">
          <Notice>{message}</Notice>
        </div>
      ) : null}
      {first("reset") === "1" ? (
        <div className="mt-lg">
          <Notice tone="success">Password updated. Sign in.</Notice>
        </div>
      ) : null}
      <SignInForm next={next} showGoogle={!isShop} />
    </AuthCard>
  );
}

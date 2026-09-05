import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-guards";
import { AuthCard } from "@/components/auth/AuthCard";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";

export const metadata: Metadata = {
  title: "Change password · Loving Hands Portal",
};

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/account/password");

  const forced = user.mustChangePassword;

  return (
    <AuthCard
      eyebrow={forced ? "One more thing" : "Your account"}
      title={forced ? "Choose your password" : "Change your password"}
      subtitle={
        forced
          ? "Your admin set the password you just used. Pick your own before you carry on."
          : "You'll stay signed in here. Every other browser is signed out."
      }
    >
      <ChangePasswordForm forced={forced} />
    </AuthCard>
  );
}

import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot password · Loving Hands Portal",
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      eyebrow="Members"
      title="Forgot your password?"
      subtitle="Give us the address you sign in with and we'll email you a link."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { isResetTokenValid } from "@/lib/password-reset";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Reset password · Loving Hands Portal",
};

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!(await isResetTokenValid(token))) {
    return (
      <AuthCard
        eyebrow="Members"
        title="This link has expired"
        subtitle="Request a new one — reset links last 30 minutes and work once."
      >
        <div className="mt-xl">
          <Button asChild className="w-full">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="Members"
      title="Set a new password"
      subtitle="Pick something you have not used here before."
    >
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}

"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { resetPassword } from "@/actions/auth";
import { Notice } from "@/components/auth/Notice";
import { PASSWORD_HINT, PasswordField } from "@/components/auth/PasswordFields";
import { Button } from "@/components/ui/button";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      noValidate
      className="mt-xl flex flex-col gap-md"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        if (password !== confirm) {
          setError("The two passwords do not match.");
          return;
        }
        setPending(true);
        const result = await resetPassword(token, password);
        setPending(false);
        if (!result.success) {
          setError(result.error);
          return;
        }
        // A reset bumps `sessionVersion`, so every session is dead — including
        // this browser's, if the link was opened while still signed in. Signing
        // out here is what makes the redirect land rather than be bounced back
        // into the portal by a cookie that has not been re-checked yet.
        await signOut({ redirectTo: "/signin?reset=1" });
      }}
    >
      {error ? <Notice>{error}</Notice> : null}

      <PasswordField
        id="password"
        label="New password"
        autoComplete="new-password"
        hint={PASSWORD_HINT}
        value={password}
        onChange={setPassword}
      />
      <PasswordField
        id="confirm"
        label="Confirm new password"
        autoComplete="new-password"
        value={confirm}
        onChange={setConfirm}
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}

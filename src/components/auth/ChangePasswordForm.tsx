"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { changePassword } from "@/actions/auth";
import { Notice } from "@/components/auth/Notice";
import { PASSWORD_HINT, PasswordField } from "@/components/auth/PasswordFields";
import { Button } from "@/components/ui/button";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
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
        const result = await changePassword({
          currentPassword: forced ? undefined : current,
          password,
        });
        setPending(false);
        if (!result.success) {
          setError(result.error);
          return;
        }
        // The change bumps `sessionVersion`, which signs every other browser
        // out. This one is re-minted by the action; if that did not happen,
        // the only honest thing left is to send the user back to sign in.
        if (result.data.reauthenticated) {
          router.push("/");
          router.refresh();
        } else {
          await signOut({ redirectTo: "/signin?reset=1" });
        }
      }}
    >
      {error ? <Notice>{error}</Notice> : null}

      {forced ? null : (
        <PasswordField
          id="current"
          label="Current password"
          autoComplete="current-password"
          value={current}
          onChange={setCurrent}
        />
      )}
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
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}

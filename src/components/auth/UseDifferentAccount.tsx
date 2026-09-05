"use client";

import { signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

/**
 * A pending visitor has no session, but the Google account is still remembered
 * by the browser. `prompt: "select_account"` is what actually lets them pick a
 * different one (design reference §3.1).
 */
export function UseDifferentAccount() {
  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      onClick={async () => {
        await signOut({ redirect: false });
        await signIn("google", { redirectTo: "/" }, { prompt: "select_account" });
      }}
    >
      Use a different account
    </Button>
  );
}

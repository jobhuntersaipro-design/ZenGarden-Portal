"use client";

import { useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

/**
 * A pending visitor has no session, but the Google account is still remembered
 * by the browser. `prompt: "select_account"` is what actually lets them pick a
 * different one (design reference §3.1).
 */
export function UseDifferentAccount() {
  // Stays pending through the redirect: Google takes over the tab from here.
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      pending={pending}
      onClick={async () => {
        setPending(true);
        await signOut({ redirect: false });
        await signIn("google", { redirectTo: "/" }, { prompt: "select_account" });
      }}
    >
      {pending ? "Switching…" : "Use a different account"}
    </Button>
  );
}

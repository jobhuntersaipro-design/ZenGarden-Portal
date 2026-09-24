"use client";

import { signOut } from "next-auth/react";

/**
 * The footer's Sign out, the one client piece of a server-rendered footer. It
 * makes the same call as the header menu's Sign out, so the two cannot end a
 * session differently.
 */
export function FooterSignOut({ className }: { className: string }) {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/" })}
      className={`text-left ${className}`}
    >
      Sign out
    </button>
  );
}

"use client";

import { useState } from "react";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDate } from "@/lib/dates";

const LABEL = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";

export function SecurityCard({
  hasPassword,
  passwordChangedAt,
}: {
  hasPassword: boolean;
  passwordChangedAt: string | null;
}) {
  const [changing, setChanging] = useState(false);

  return (
    <section id="password" className="rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="mb-md font-display text-[length:var(--text-heading-sm)] text-ink">
        Security
      </h2>

      <div className="flex flex-col gap-xs">
        <span className={LABEL}>Password</span>
        {hasPassword ? (
          <>
            <p className="text-[length:var(--text-body-md)] text-ink">
              {passwordChangedAt
                ? `Last changed ${formatDate(passwordChangedAt)}`
                : "Never changed"}
            </p>
            <div>
              <Button variant="secondary" onClick={() => setChanging(true)}>
                Change password
              </Button>
            </div>
          </>
        ) : (
          // The same line and reasoning the admin users table uses.
          <p
            className="text-[length:var(--text-body-md)] text-ink-tertiary"
            title="You sign in with Google, so there is no password to change. Ask a super admin to set one if you need email sign-in."
          >
            Password managed by Google
          </p>
        )}
      </div>

      <Sheet open={changing} onOpenChange={setChanging}>
        {/* max-w-panel-sm, never max-w-sm: Tailwind v4 resolves max-w-<name>
            against --spacing-<name> first, and this system names a spacing step
            `sm`, so max-w-sm compiles to 12px. */}
        <SheetContent className="w-full overflow-y-auto sm:max-w-panel-sm">
          <SheetHeader>
            <SheetTitle>Change your password</SheetTitle>
          </SheetHeader>
          <div className="px-lg pb-lg">
            <ChangePasswordForm forced={false} />
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}

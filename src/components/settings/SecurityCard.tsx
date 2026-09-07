"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { signOutEverywhere } from "@/actions/profile";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <section id="password" className="rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="mb-md font-display text-[length:var(--text-heading-sm)] text-ink">
        Security
      </h2>

      <div className="flex flex-col gap-lg">
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

        <div className="flex flex-col gap-xs">
          <span className={LABEL}>Sessions</span>
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            Signs you out of every browser, including this one.
          </p>
          <div>
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              Sign out on all devices
            </Button>
          </div>
        </div>
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

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out on all devices?</DialogTitle>
            <DialogDescription>
              This signs you out here as well. You&rsquo;ll need to sign in
              again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              pending={pending}
              onClick={async () => {
                setPending(true);
                const result = await signOutEverywhere();
                if (!result.success) {
                  setPending(false);
                  toast.error(result.error);
                  return;
                }
                // Deliberately not re-minted, unlike changePassword: ending
                // this session is the point.
                await signOut({ redirectTo: "/signin" });
              }}
            >
              Sign out everywhere
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

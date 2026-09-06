"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createUser,
  deleteUser,
  setPassword,
  updateUser,
} from "@/actions/users";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Role } from "@/generated/prisma/enums";
import type { AdminUserRow } from "@/lib/queries/users";

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";

export function UserDrawer({
  user,
  open,
  onClose,
}: {
  user: AdminUserRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const isNew = user === null;

  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    role: user?.role ?? Role.MEMBER,
    active: user ? user.status !== "Disabled" : true,
  });
  const [password, setPasswordValue] = useState("");
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typedEmail, setTypedEmail] = useState("");

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const done = (message: string) => {
    toast.success(message);
    router.refresh();
    onClose();
  };

  // Compared the same way the action compares it, so the button and the server
  // agree about what counts as a match.
  const emailMatches =
    user !== null &&
    typedEmail.trim().toLowerCase() === user.email.toLowerCase();

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-panel-md">
        <SheetHeader>
          <SheetTitle>{isNew ? "New user" : "Edit user"}</SheetTitle>
          <SheetDescription>
            {isNew
              ? "Leave the password blank and they sign in with Google."
              : "Changes take effect at their next session refresh."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-md p-md">
          {createdPassword ? (
            <div className="rounded-sm bg-surface-soft p-sm">
              <p className="text-[length:var(--text-caption)] text-ink-secondary">
                Shown once. It has also been emailed to them.
              </p>
              <p className="font-mono text-[length:var(--text-body-md)] text-ink">
                {createdPassword}
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-xxs">
            <label htmlFor="user-name" className={label}>
              Name
            </label>
            <Input
              id="user-name"
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-xxs">
            <label htmlFor="user-email" className={label}>
              Email
            </label>
            <Input
              id="user-email"
              type="email"
              value={form.email}
              onChange={(event) => set("email", event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-xxs">
            <label htmlFor="user-role" className={label}>
              Role
            </label>
            <select
              id="user-role"
              value={form.role}
              onChange={(event) => set("role", event.target.value as Role)}
              className="h-control-md rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus"
            >
              <option value={Role.MEMBER}>Member</option>
              <option value={Role.SUPER_ADMIN}>Super admin</option>
            </select>
          </div>

          <div className="flex flex-col gap-xxs">
            <label htmlFor="user-password" className={label}>
              {isNew ? "Password (optional)" : "Set a new password"}
            </label>
            <Input
              id="user-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPasswordValue(event.target.value)}
            />
            <p className="text-[length:var(--text-caption)] text-ink-tertiary">
              {isNew
                ? "At least 10 characters, with a letter and a digit. Leave blank for Google-only."
                : "Setting one signs them out of every session immediately."}
            </p>
          </div>

          {isNew ? null : (
            <label className="flex items-center gap-xs text-[length:var(--text-body-sm)] text-ink">
              <Switch
                checked={form.active}
                onCheckedChange={(value) => set("active", value === true)}
              />
              Active
            </label>
          )}

          <div className="flex flex-wrap items-center gap-sm">
            <Button
              pending={pending}
              onClick={async () => {
                setPending(true);
                if (isNew) {
                  const result = await createUser({
                    name: form.name,
                    email: form.email,
                    role: form.role,
                    ...(password ? { password } : {}),
                    mustChangePassword: true,
                  });
                  setPending(false);
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  if (result.data.password) {
                    setCreatedPassword(result.data.password);
                    toast.success("User created — the password is shown once");
                    router.refresh();
                    return;
                  }
                  done("They can sign in with Google now");
                  return;
                }

                const result = await updateUser(user!.id, form);
                if (result.success && password) {
                  const passwordResult = await setPassword(user!.id, password);
                  setPending(false);
                  if (!passwordResult.success) {
                    toast.error(passwordResult.error);
                    return;
                  }
                  done("Saved · they are signed out everywhere");
                  return;
                }
                setPending(false);
                if (!result.success) toast.error(result.error);
                else done("Saved");
              }}
            >
              {pending ? "Saving…" : isNew ? "Create user" : "Save changes"}
            </Button>

            {isNew ? null : (
              <Button
                variant="secondary"
                className="text-accent-red"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            )}
          </div>
        </div>

        {user ? (
          <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete {user.name}?</DialogTitle>
                <DialogDescription>
                  Their uploads, confirmations and stage events stay, still
                  attributed to them. They lose access immediately.
                </DialogDescription>
              </DialogHeader>
              <label htmlFor="confirm-email" className={label}>
                Confirm the email
              </label>
              <Input
                id="confirm-email"
                value={typedEmail}
                onChange={(event) => setTypedEmail(event.target.value)}
              />
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                Type {user.email} to confirm
              </p>
              <DialogFooter>
                <Button
                  variant="secondary"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  className="bg-ink text-canvas hover:bg-ink-deep"
                  // Stays disabled until the address matches exactly. The
                  // action checks it again; this is the friction, not the gate.
                  disabled={!emailMatches}
                  pending={pending}
                  onClick={async () => {
                    setPending(true);
                    const result = await deleteUser(user.id, typedEmail);
                    setPending(false);
                    if (!result.success) {
                      toast.error(result.error);
                      return;
                    }
                    setConfirmDelete(false);
                    done("User deleted");
                  }}
                >
                  {pending ? "Deleting…" : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { PersonChip } from "@/components/ui/person";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import {
  inviteBuyerContact,
  removeBuyerContact,
  resendClientInvite,
  resetClientPassword,
  setClientAccess,
  updateBuyerContact,
} from "@/actions/clients";
import type { BuyerContact } from "@/lib/queries/clients";

/**
 * The buyer's own staff who can sign in on the shop host. Super admin only:
 * these accounts see trade prices, so who gets one is not a Member's call.
 *
 * Status wording follows Phase 09 — Invited and Disabled are neutral text, not
 * a coloured fill, and colour never carries the meaning alone.
 */
export function BuyerContactsCard({
  buyerId,
  contacts,
  canManage,
}: {
  buyerId: string;
  contacts: BuyerContact[];
  canManage: boolean;
}) {
  const refresh = useAwaitableRefresh();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", username: "", phone: "" });
  const [resetting, setResetting] = useState<BuyerContact | null>(null);
  const [removing, setRemoving] = useState<BuyerContact | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(key);
    try {
      const result = await fn();
      if (!result.success) toast.error(result.error ?? "That didn't work.");
      else await refresh();
      return result.success;
    } catch {
      // An unguarded await here is what left the avatar picker permanently
      // disabled on 2026-09-08.
      toast.error("We couldn't reach the server. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h2 className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          Shop contacts
        </h2>
        {canManage ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="min-h-control-md text-[length:var(--text-body-sm)] text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-control-sm"
          >
            {open ? "Cancel" : "Invite someone"}
          </button>
        ) : null}
      </div>

      {contacts.length === 0 ? (
        <p className="mt-xs text-[length:var(--text-body-sm)] text-ink-tertiary">
          {canManage
            ? "Nobody from this buyer can sign in yet."
            : "Nobody from this buyer can sign in yet. Ask a super admin."}
        </p>
      ) : (
        <ul className="mt-xs flex flex-col gap-xs">
          {contacts.map((contact) => (
            <li
              key={contact.id}
              className="flex flex-wrap items-center gap-xs border-b border-hairline pb-xs last:border-0 last:pb-0"
            >
              {editing === contact.id ? (
                <div className="flex min-w-0 flex-1 flex-col gap-xxs">
                  <Input
                    aria-label="Edit contact name"
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                  <Input
                    aria-label="Edit contact username"
                    value={draft.username}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, username: event.target.value }))
                    }
                  />
                  <Input
                    aria-label="Edit contact phone"
                    value={draft.phone}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, phone: event.target.value }))
                    }
                  />
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <PersonChip name={contact.name} image={contact.image} />
                  <p
                    className="truncate text-[length:var(--text-caption)] text-ink-tertiary"
                    title={contact.email}
                  >
                    {contact.username ? `${contact.username} · ` : ""}
                    {contact.email}
                  </p>
                  {contact.phone ? (
                    <p className="truncate text-[length:var(--text-caption)] text-ink-tertiary">
                      {contact.phone}
                    </p>
                  ) : null}
                </div>
              )}
              {editing === contact.id ? (
                <div className="flex items-center gap-xxs">
                  <Button
                    pending={busy === `edit-${contact.id}`}
                    onClick={() =>
                      void run(`edit-${contact.id}`, async () => {
                        const result = await updateBuyerContact(contact.id, draft);
                        if (result.success) {
                          toast.success("Contact updated.");
                          setEditing(null);
                        }
                        return result;
                      })
                    }
                  >
                    Save
                  </Button>
                  <Button variant="secondary" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <span className="text-[length:var(--text-caption)] text-ink-secondary">
                    {contact.disabledAt
                      ? "Disabled"
                      : contact.invited
                        ? "Invited"
                        : "Active"}
                  </span>
                  {canManage ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="secondary"
                          aria-label={`Actions for ${contact.name}`}
                          className="size-11 p-0 sm:size-control-sm"
                        >
                          <MoreHorizontal className="size-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setDraft({
                              name: contact.name,
                              username: contact.username ?? "",
                              phone: contact.phone ?? "",
                            });
                            setEditing(contact.id);
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setResetting(contact)}>
                          Reset password
                        </DropdownMenuItem>
                        {/* Only while the invitation is still the way in. */}
                        {contact.invited && !contact.disabledAt ? (
                          <DropdownMenuItem
                            onSelect={() =>
                              void run(`resend-${contact.id}`, async () => {
                                const result = await resendClientInvite(contact.id);
                                if (result.success) {
                                  toast[result.data.sent ? "success" : "warning"](
                                    result.data.sent
                                      ? "Invitation sent again."
                                      : "Password reset, but the email didn't send. Try again.",
                                  );
                                }
                                return result;
                              })
                            }
                          >
                            Resend invitation
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onSelect={() =>
                            void run(`access-${contact.id}`, () =>
                              setClientAccess(contact.id, Boolean(contact.disabledAt)),
                            )
                          }
                        >
                          {contact.disabledAt ? "Restore access" : "Disable access"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setRemoving(contact)}
                        >
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && canManage ? (
        <form
          className="mt-md flex flex-col gap-xs"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const ok = await run("invite", () =>
                inviteBuyerContact({ buyerId, name, email, username, phone }),
              );
              if (ok) {
                toast.success("Invite sent.");
                setName("");
                setEmail("");
                setUsername("");
                setPhone("");
                setOpen(false);
              }
            });
          }}
        >
          <Input
            aria-label="Contact name"
            placeholder="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            aria-label="Contact email"
            type="email"
            placeholder="name@buyer.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            aria-label="Contact username"
            placeholder="siti.ops"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Input
            aria-label="Contact phone"
            placeholder="+60 12-345 6789"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <div className="flex items-center gap-xs">
            <Button type="submit" pending={busy === "invite"}>
              Send invite
            </Button>
            <p className="text-[length:var(--text-caption)] text-ink-tertiary">
              They get a temporary password and sign in on the shop.
            </p>
          </div>
        </form>
      ) : null}

      <Dialog open={resetting !== null} onOpenChange={() => setResetting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email a temporary password to {resetting?.email}?</DialogTitle>
            <DialogDescription>
              They will have to choose a new one the next time they sign in, and every
              device they are signed in on will be signed out.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setResetting(null)}>
              Cancel
            </Button>
            <Button
              pending={busy === `reset-${resetting?.id}`}
              onClick={() => {
                const target = resetting;
                if (!target) return;
                void run(`reset-${target.id}`, async () => {
                  const result = await resetClientPassword(target.id);
                  if (result.success) {
                    setResetting(null);
                    // The toast says what happened, not what we hoped: a
                    // Resend failure resolves { sent: false }, and telling
                    // someone to check an inbox that stays empty is the
                    // defect Phase 23 found in exactly this flow.
                    toast[result.data.sent ? "success" : "warning"](
                      result.data.sent
                        ? `Temporary password emailed to ${target.email}`
                        : "Password was reset, but the email didn't send. Try Reset password again.",
                    );
                  }
                  return result;
                });
              }}
            >
              Reset password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removing !== null}
        onOpenChange={() => {
          setRemoving(null);
          setRemoveError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>
              Their shop login is deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {removeError ? (
            <p className="text-[length:var(--text-body-sm)] text-brand-amber">{removeError}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setRemoving(null);
                setRemoveError(null);
              }}
            >
              Cancel
            </Button>
            {/* The refusal is not a dead end: the thing they should do
                instead is a button, not a sentence telling them to go and
                find one. */}
            {removeError ? (
              <Button
                pending={busy === `access-${removing?.id}`}
                onClick={() => {
                  const target = removing;
                  if (!target) return;
                  void run(`access-${target.id}`, async () => {
                    const result = await setClientAccess(target.id, false);
                    if (result.success) {
                      setRemoving(null);
                      setRemoveError(null);
                      toast.success(`${target.name}'s access is disabled.`);
                    }
                    return result;
                  });
                }}
              >
                Disable instead
              </Button>
            ) : (
              <Button
                pending={busy === `remove-${removing?.id}`}
                onClick={() => {
                  const target = removing;
                  if (!target) return;
                  void (async () => {
                    setBusy(`remove-${target.id}`);
                    try {
                      const result = await removeBuyerContact(target.id);
                      if (result.success) {
                        setRemoving(null);
                        toast.success(`${target.name} removed.`);
                        await refresh();
                      } else {
                        // Shown in the dialog, not as a toast: the reason is
                        // the answer to the question the dialog is asking.
                        setRemoveError(result.error);
                      }
                    } catch {
                      toast.error("We couldn't reach the server. Try again.");
                    } finally {
                      setBusy(null);
                    }
                  })();
                }}
              >
                Remove
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

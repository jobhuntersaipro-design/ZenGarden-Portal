"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PersonChip } from "@/components/ui/person";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import {
  inviteBuyerContact,
  resendClientInvite,
  setClientAccess,
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
              <div className="min-w-0 flex-1">
                <PersonChip name={contact.name} image={contact.image} />
                <p
                  className="truncate text-[length:var(--text-caption)] text-ink-tertiary"
                  title={contact.email}
                >
                  {contact.email}
                </p>
              </div>
              <span className="text-[length:var(--text-caption)] text-ink-secondary">
                {contact.disabledAt
                  ? "Disabled"
                  : contact.invited
                    ? "Invited"
                    : "Active"}
              </span>
              {canManage ? (
                <div className="flex items-center gap-xxs">
                  <Button
                    variant="secondary"
                    pending={busy === `resend-${contact.id}`}
                    onClick={() =>
                      void run(`resend-${contact.id}`, async () => {
                        const result = await resendClientInvite(contact.id);
                        if (result.success) toast.success("Invite sent again.");
                        return result;
                      })
                    }
                  >
                    Resend
                  </Button>
                  <Button
                    variant="secondary"
                    pending={busy === `access-${contact.id}`}
                    onClick={() =>
                      void run(`access-${contact.id}`, () =>
                        setClientAccess(contact.id, Boolean(contact.disabledAt)),
                      )
                    }
                  >
                    {contact.disabledAt ? "Restore" : "Disable"}
                  </Button>
                </div>
              ) : null}
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
    </section>
  );
}

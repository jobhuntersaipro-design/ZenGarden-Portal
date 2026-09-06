"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { approveAccessRequest, declineAccessRequest } from "@/actions/users";
import { RingBadge } from "@/components/admin/RingBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Role } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/dates";

export type PendingRequest = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  firstSeen: string;
  lastSeen: string;
};

export function PendingRequests({ requests }: { requests: PendingRequest[] }) {
  const router = useRouter();
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [notify, setNotify] = useState<Record<string, boolean>>({});
  /**
   * Which request is in flight and which way it is going. The id alone would
   * disable both buttons on that row — right — but could not say which of them
   * to label, and a button that reads "Approving…" while a decline runs is
   * worse than no label at all (brief G1).
   */
  const [pending, setPending] = useState<
    { id: string; action: "approve" | "decline" } | null
  >(null);

  // Hidden entirely when empty: an empty queue needs no furniture.
  if (requests.length === 0) return null;

  return (
    <section className="mb-lg rounded-lg border border-hairline bg-canvas">
      <div className="flex items-baseline justify-between gap-sm p-lg pb-md">
        <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          Pending access requests
        </p>
        <p className="text-[length:var(--text-caption)] text-ink-tertiary">
          {requests.length} waiting
        </p>
      </div>

      <ul className="divide-y divide-hairline border-t border-hairline">
        {requests.map((request) => (
          <li key={request.id} className="flex flex-wrap items-center gap-sm p-lg">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-xs">
                <span
                  title={request.name}
                  className="truncate text-[length:var(--text-body-sm)] font-medium text-ink"
                >
                  {request.name}
                </span>
                <RingBadge>Pending</RingBadge>
              </span>
              <span
                title={request.email}
                className="block truncate text-[length:var(--text-caption)] text-ink-tertiary"
              >
                {request.email} · asked {formatDateTime(request.firstSeen)}
              </span>
            </span>

            <label className="sr-only" htmlFor={`role-${request.id}`}>
              Role for {request.name}
            </label>
            <select
              id={`role-${request.id}`}
              value={roles[request.id] ?? Role.MEMBER}
              onChange={(event) =>
                setRoles((current) => ({
                  ...current,
                  [request.id]: event.target.value as Role,
                }))
              }
              className="h-control-sm rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value={Role.MEMBER}>Member</option>
              <option value={Role.SUPER_ADMIN}>Super admin</option>
            </select>

            <label className="flex items-center gap-xxs text-[length:var(--text-caption)] text-ink-secondary">
              <Checkbox
                checked={notify[request.id] ?? false}
                onCheckedChange={(value) =>
                  setNotify((current) => ({
                    ...current,
                    [request.id]: value === true,
                  }))
                }
              />
              Email on decline
            </label>

            <div className="flex items-center gap-xs">
              <Button
                variant="secondary"
                disabled={pending?.id === request.id}
                pending={pending?.id === request.id && pending.action === "decline"}
                onClick={async () => {
                  setPending({ id: request.id, action: "decline" });
                  const result = await declineAccessRequest(
                    request.id,
                    notify[request.id] ?? false,
                  );
                  setPending(null);
                  if (!result.success) toast.error(result.error);
                  else {
                    toast.success(`Declined ${request.name}`);
                    router.refresh();
                  }
                }}
              >
                {pending?.id === request.id && pending.action === "decline"
                  ? "Declining…"
                  : "Decline"}
              </Button>
              <Button
                disabled={pending?.id === request.id}
                pending={pending?.id === request.id && pending.action === "approve"}
                onClick={async () => {
                  setPending({ id: request.id, action: "approve" });
                  const result = await approveAccessRequest(
                    request.id,
                    roles[request.id] ?? Role.MEMBER,
                  );
                  setPending(null);
                  if (!result.success) toast.error(result.error);
                  else {
                    toast.success(`${request.name} is in`);
                    router.refresh();
                  }
                }}
              >
                {pending?.id === request.id && pending.action === "approve"
                  ? "Approving…"
                  : "Approve"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

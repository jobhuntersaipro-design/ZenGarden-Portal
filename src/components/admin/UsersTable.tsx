"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { requestPasswordReset } from "@/actions/auth";
import { UserStatusBadge } from "@/components/admin/RingBadge";
import { UserDrawer } from "@/components/admin/UserDrawer";
import { DataTable, type Column } from "@/components/portal/DataTable";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { useTableSort } from "@/hooks/useTableSort";
import { formatDateTime } from "@/lib/dates";
import type { AdminUserRow, UserStatusFilter } from "@/lib/queries/users";
import type { SortDirection } from "@/lib/queries/pagination";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

const STATUSES: { value: UserStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "disabled", label: "Disabled" },
];

const GOOGLE_ONLY_TITLE =
  "This user signs in with Google; there is no password to reset. Set one in the drawer if they need email sign-in.";

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function UsersTable({
  users,
  sort,
  status,
  openUserId,
}: {
  users: AdminUserRow[];
  sort: { key: string; dir: SortDirection };
  status: UserStatusFilter;
  openUserId: string | null;
}) {
  const onSortChange = useTableSort();
  const { replace } = useUrlNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [resetting, setResetting] = useState<AdminUserRow | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const write = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  };

  const openDrawer = (id: string) => write({ user: id });
  const closeDrawer = () => write({ user: null });

  const columns: Column<AdminUserRow>[] = [
    {
      key: "name",
      header: "User",
      cell: (row) => (
        <span className="flex items-center gap-xs">
          <Avatar className="size-7 shrink-0">
            {row.image ? <AvatarImage src={row.image} alt="" /> : null}
            <AvatarFallback className="bg-surface-soft text-[length:var(--text-caption)] text-ink">
              {initials(row.name)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span
              title={row.name}
              className="block truncate font-medium text-ink"
            >
              {row.name}
            </span>
            <span
              title={row.email}
              className="block truncate text-[length:var(--text-caption)] text-ink-tertiary"
            >
              {row.email}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (row) => (row.role === "SUPER_ADMIN" ? "Super admin" : "Member"),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <UserStatusBadge status={row.status} />,
    },
    {
      key: "lastActiveAt",
      header: "Last active",
      defaultDir: "desc",
      cell: (row) =>
        row.lastActiveAt ? (
          formatDateTime(row.lastActiveAt)
        ) : (
          <span className="text-ink-tertiary">Never</span>
        ),
    },
    {
      key: "password",
      header: "Password",
      sortable: false,
      cell: (row) =>
        row.hasPassword ? (
          <button
            type="button"
            onClick={() => setResetting(row)}
            className="text-[length:var(--text-caption)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Reset password
          </button>
        ) : (
          // No dead link: there is nothing to reset, and the title says why.
          <span
            title={GOOGLE_ONLY_TITLE}
            className="text-[length:var(--text-caption)] text-ink-tertiary"
          >
            Password managed by Google
          </span>
        ),
    },
    {
      key: "edit",
      header: "",
      sortable: false,
      cell: (row) => (
        <button
          type="button"
          onClick={() => openDrawer(row.id)}
          className="text-[length:var(--text-caption)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Edit
        </button>
      ),
    },
  ];

  const openUser =
    openUserId === "new"
      ? null
      : (users.find((u) => u.id === openUserId) ?? null);

  return (
    <>
      <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
        <div className="flex flex-wrap items-center gap-sm">
          <Input
            aria-label="Search users"
            placeholder="Name or email…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              write({ q: event.target.value });
            }}
            className="h-control-md sm:h-control-sm w-64"
          />
          <div className="flex flex-wrap items-center gap-xxs">
            {STATUSES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={status === option.value}
                onClick={() =>
                  write({
                    status: option.value === "all" ? null : option.value,
                  })
                }
                className={`h-control-md sm:h-control-sm rounded-pill px-md text-[length:var(--text-caption)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                  status === option.value
                    ? "bg-ink text-canvas"
                    : "bg-surface-soft text-ink-secondary hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <Button onClick={() => openDrawer("new")}>+ New user</Button>
      </div>

      <DataTable
        columns={columns}
        rows={users}
        sort={sort}
        onSortChange={onSortChange}
        emptyText="No users match."
      />

      <UserDrawer
        key={openUserId ?? "closed"}
        user={openUser}
        open={openUserId !== null}
        onClose={closeDrawer}
      />

      <Dialog open={resetting !== null} onOpenChange={() => setResetting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email a reset link to {resetting?.email}?</DialogTitle>
            <DialogDescription>
              The link lasts 30 minutes and works once.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setResetting(null)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              className="bg-ink text-canvas hover:bg-ink-deep"
              onClick={async () => {
                const target = resetting;
                setResetting(null);
                if (!target) return;
                const result = await requestPasswordReset(target.email);
                if (result.success) toast.success("Reset link sent");
                else toast.error(result.error);
              }}
            >
              Send link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

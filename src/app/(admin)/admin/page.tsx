import type { Metadata } from "next";
import { PendingRequests } from "@/components/admin/PendingRequests";
import { UsersTable } from "@/components/admin/UsersTable";
import {
  USER_SORT_KEYS,
  listPendingRequests,
  listUsers,
  selectUsers,
  type UserStatusFilter,
} from "@/lib/queries/users";
import {
  firstParam,
  parseSort,
  type SearchParams,
} from "@/lib/queries/pagination";

export const metadata: Metadata = { title: "Admin · Loving Hands Portal" };
export const dynamic = "force-dynamic";

const STATUSES: UserStatusFilter[] = ["all", "active", "invited", "disabled"];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [users, requests] = await Promise.all([listUsers(), listPendingRequests()]);

  const statusParam = firstParam(params, "status") as UserStatusFilter;
  const status = STATUSES.includes(statusParam) ? statusParam : "all";
  const q = firstParam(params, "q")?.trim() || undefined;
  const sort = parseSort(params, USER_SORT_KEYS, { key: "createdAt", dir: "asc" });

  const rows = selectUsers(users, { q, status, sort });
  const openUserId = firstParam(params, "user") ?? null;

  return (
    <>
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Access
      </p>
      <h1 className="mb-lg font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink">
        Users
      </h1>

      <PendingRequests requests={requests} />

      <UsersTable
        users={rows}
        sort={sort}
        status={status}
        openUserId={openUserId}
      />
    </>
  );
}

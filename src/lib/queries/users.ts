import { prisma } from "@/lib/prisma";
import { deriveUserStatus } from "@/lib/validation/users";
import type { Role } from "@/generated/prisma/enums";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  status: "Disabled" | "Invited" | "Active";
  /** Google-only users have nothing to reset. */
  hasPassword: boolean;
  lastActiveAt: string | null;
  createdAt: string;
};

export const USER_SORT_KEYS = [
  "name",
  "email",
  "role",
  "status",
  "lastActiveAt",
  "createdAt",
] as const;

export type UserSortKey = (typeof USER_SORT_KEYS)[number];
export type UserStatusFilter = "all" | "active" | "invited" | "disabled";

export async function listUsers(): Promise<AdminUserRow[]> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      disabledAt: true,
      passwordHash: true,
      lastActiveAt: true,
      createdAt: true,
      _count: { select: { accounts: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    status: deriveUserStatus({
      disabledAt: user.disabledAt,
      passwordHash: user.passwordHash,
      accountCount: user._count.accounts,
      lastActiveAt: user.lastActiveAt,
    }),
    // The hash itself never leaves the server; only whether there is one.
    hasPassword: user.passwordHash !== null,
    lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  }));
}

export async function listPendingRequests() {
  const requests = await prisma.accessRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { firstSeen: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      firstSeen: true,
      lastSeen: true,
    },
  });
  return requests.map((request) => ({
    ...request,
    firstSeen: request.firstSeen.toISOString(),
    lastSeen: request.lastSeen.toISOString(),
  }));
}

/** Filter, search and sort in memory: this table is a dozen rows, not a list. */
export function selectUsers(
  users: AdminUserRow[],
  {
    q,
    status,
    sort,
  }: {
    q?: string;
    status: UserStatusFilter;
    sort: { key: UserSortKey; dir: "asc" | "desc" };
  },
): AdminUserRow[] {
  const needle = q?.trim().toLowerCase();

  const filtered = users.filter((user) => {
    if (
      needle &&
      !user.name.toLowerCase().includes(needle) &&
      !user.email.toLowerCase().includes(needle)
    ) {
      return false;
    }
    if (status === "all") return true;
    return user.status.toLowerCase() === status;
  });

  const value = (user: AdminUserRow): string | number => {
    switch (sort.key) {
      case "name":
        return user.name.toLowerCase();
      case "email":
        return user.email.toLowerCase();
      case "role":
        return user.role;
      case "status":
        return user.status;
      case "lastActiveAt":
        return user.lastActiveAt ? Date.parse(user.lastActiveAt) : 0;
      case "createdAt":
        return Date.parse(user.createdAt);
    }
  };

  return [...filtered].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const comparison =
      typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right)
        : Number(left) - Number(right);
    return sort.dir === "asc" ? comparison : -comparison;
  });
}

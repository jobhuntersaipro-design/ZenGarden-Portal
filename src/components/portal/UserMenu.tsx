"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useAvatarSaving } from "@/components/portal/AvatarSaving";
import { Spinner } from "@/components/portal/Spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/ui/person";

export type UserMenuProps = {
  name: string;
  /**
   * Required rather than defaulted: a call site that forgets it should fail
   * the build, not quietly hide the one way into the admin room.
   */
  isSuperAdmin: boolean;
  image?: string | null;
  collapsed?: boolean;
};

export function UserMenu({
  name,
  isSuperAdmin,
  image = null,
  collapsed = false,
}: UserMenuProps) {
  // This menu only ever names the signed-in person, so the flag needs no
  // identity: if a picture is saving, it is theirs.
  const { saving } = useAvatarSaving();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${name}`}
        className="flex w-full items-center gap-xs rounded-sm p-xs text-left transition-colors duration-[0.25s] ease-[cubic-bezier(0.5,0,0.5,1)] hover:bg-canvas focus-visible:outline-2 focus-visible:outline-focus"
      >
        <span className="relative shrink-0">
          <PersonAvatar name={name} image={image} size="md" />
          {saving ? (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-canvas/70 text-ink">
              <Spinner />
            </span>
          ) : null}
        </span>
        {collapsed ? null : (
          // The name alone. The address used to sit under it and wrap to two
          // lines, which is most of the chip's height spent on something the
          // signed-in person already knows; `/settings` still shows it.
          <span
            title={name}
            className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] font-medium text-ink"
          >
            {name}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {/* Settings is reached from here, never as a nav row: NAV is
            destinations only (00-master.md §4). MobileTopBar renders this same
            menu, so both navs get it from one change. */}
        {/* Admin sits here for the same reason, and only for a super admin —
            it is a separate room rather than a destination, and a member who
            cannot enter it should not be shown its door. The room is guarded
            twice over regardless: the (admin) layout redirects and
            src/proxy.ts rewrites to a 404, so this hides a link, never a
            permission. */}
        {isSuperAdmin ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">Admin</Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut({ redirectTo: "/signin" })}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

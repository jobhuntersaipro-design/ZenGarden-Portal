"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
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
  email: string;
  image?: string | null;
  collapsed?: boolean;
};

export function UserMenu({
  name,
  email,
  image = null,
  collapsed = false,
}: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${name}`}
        className="flex w-full items-center gap-xs rounded-sm p-xs text-left transition-colors duration-[0.25s] ease-[cubic-bezier(0.5,0,0.5,1)] hover:bg-canvas focus-visible:outline-2 focus-visible:outline-focus"
      >
        <PersonAvatar name={name} image={image} size="md" />
        {collapsed ? null : (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[length:var(--text-body-sm)] font-medium text-ink">
              {name}
            </span>
            {/* Wraps to two lines rather than ellipsising (brief G3): the
                sidebar is 240px and "aisha@lovinghandsportal.com" does not
                fit on one, so a single clipped line was a dead end. `title`
                stays for the rare address long enough to clip even at two. */}
            <span
              title={email}
              className="block line-clamp-2 break-all text-[length:var(--text-caption)] text-ink-tertiary"
            >
              {email}
            </span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {/* Settings is reached from here, never as a nav row: NAV is
            destinations only (00-master.md §4). MobileTopBar renders this same
            menu, so both navs get it from one change. */}
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

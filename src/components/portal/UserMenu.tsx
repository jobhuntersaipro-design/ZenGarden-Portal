"use client";

import { signOut } from "next-auth/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type UserMenuProps = {
  name: string;
  email: string;
  image?: string | null;
  collapsed?: boolean;
};

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
        className="flex w-full items-center gap-xs rounded-sm p-xs text-left transition-colors duration-[0.25s] ease-[cubic-bezier(0.5,0,0.5,1)] hover:bg-canvas focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Avatar className="size-8 shrink-0">
          {image ? <AvatarImage src={image} alt="" /> : null}
          <AvatarFallback className="bg-surface-soft text-[length:var(--text-caption)] text-ink">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
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
        <DropdownMenuItem onSelect={() => signOut({ redirectTo: "/signin" })}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

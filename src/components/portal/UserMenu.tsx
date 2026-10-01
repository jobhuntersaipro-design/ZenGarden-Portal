"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserMenu as ArcUserMenu } from "@/components/arc/user-menu/user-menu";
import { useIsArc } from "@/components/ui-mode/UiModeProvider";
import { LogOut, Settings, ShieldCheck } from "lucide-react";
import { signOut } from "next-auth/react";
import { useAvatarSaving } from "@/components/portal/AvatarSaving";
import { Spinner } from "@/components/portal/Spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/ui/person";

/**
 * Every row is a 44px touch target, which the shared `DropdownMenuItem`
 * primitive is not — it sits at 28px, fine for a desktop sort menu and under
 * this project's phone floor (the 2026-09-06 mobile pass). Applied here rather
 * than to the primitive, which every other dropdown in the portal shares.
 * The shop's own account menu already uses `h-control-md` for the same reason.
 */
const ROW = "h-control-md gap-sm px-sm text-[length:var(--text-body-sm)]";

export type UserMenuProps = {
  name: string;
  /** Shown as the menu's first header line. */
  email: string;
  /** `roleLabel()`'s spelling, shown under the email. */
  roleName: string;
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
  email,
  roleName,
  isSuperAdmin,
  image = null,
  collapsed = false,
}: UserMenuProps) {
  // This menu only ever names the signed-in person, so the flag needs no
  // identity: if a picture is saving, it is theirs.
  const { saving } = useAvatarSaving();
  const isArc = useIsArc();
  const router = useRouter();

  if (isArc) {
    // Arc mode: Arc's user menu — identity header, account rows and sign out,
    // opening as a bottom sheet below 640px. The theme switch is off: the
    // portal is light only. The role rides in Arc's "plan" line.
    return (
      <span className="relative inline-flex">
        <ArcUserMenu
          user={{ name, email, plan: roleName, avatarSrc: image ?? undefined }}
          showTheme={false}
          showName={!collapsed}
          // Arc's trigger is 40px (32px avatar, 4px padding); the phone's
          // floor is 44, so the padding grows to 6px there.
          className="max-sm:h-11 max-sm:p-1.5"
          align="start"
          items={[
            ...(isSuperAdmin
              ? [{ label: "Admin", icon: <ShieldCheck aria-hidden />, onSelect: () => router.push("/admin") }]
              : []),
            { label: "Settings", icon: <Settings aria-hidden />, onSelect: () => router.push("/settings") },
          ]}
          onSignOut={() => signOut({ redirectTo: "/signin" })}
        />
        {saving ? (
          // The trigger's avatar is 32px, 4px in from its edge (6px on a phone).
          <span className="pointer-events-none absolute top-xxs left-xxs max-sm:top-1.5 max-sm:left-1.5 grid size-8 place-items-center rounded-full bg-canvas/70 text-ink">
            <Spinner />
          </span>
        ) : null}
      </span>
    );
  }

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
      {/* `collisionPadding` keeps a gutter at 390px, where the menu is
          otherwise flush against the right edge of the screen. */}
      <DropdownMenuContent align="start" collisionPadding={12} className="w-64">
        {/* Who you are signed in as, and as what. Not a menu item: neither
            line is an action, so neither takes a hover or a focus ring.
            `truncate` with a `title`, because an address long enough to wrap
            would otherwise set the menu's height (00-master.md §4's
            truncation-recovery rule). */}
        <DropdownMenuLabel className="font-normal">
          <span
            title={email}
            className="block truncate text-[length:var(--text-body-sm)] text-ink"
          >
            {email}
          </span>
          <span className="mt-xxs block text-[length:var(--text-caption)] text-ink-tertiary">
            {roleName}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
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
          <DropdownMenuItem asChild className={ROW}>
            <Link href="/admin">
              <ShieldCheck aria-hidden />
              Admin
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild className={ROW}>
          <Link href="/settings">
            <Settings aria-hidden />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* "Sign out", not "Log out": it pairs with the Sign in it undoes, and
            the shop's own account menu says the same. */}
        <DropdownMenuItem
          className={ROW}
          onSelect={() => signOut({ redirectTo: "/signin" })}
        >
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

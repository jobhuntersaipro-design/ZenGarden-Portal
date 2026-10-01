"use client";

import { useRouter } from "next/navigation";
import { UserMenu as ArcUserMenu } from "@/components/arc/user-menu/user-menu";
import { Settings, ShieldCheck } from "lucide-react";
import { signOut } from "next-auth/react";
import { useAvatarSaving } from "@/components/portal/AvatarSaving";
import { Spinner } from "@/components/portal/Spinner";
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
  const router = useRouter();

  // Arc's user menu — identity header, account rows and sign out,
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

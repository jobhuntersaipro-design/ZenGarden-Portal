import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import type { StylePreview } from "@/components/settings/AvatarPicker";
import { ProfileCard } from "@/components/settings/ProfileCard";
import { SecurityCard } from "@/components/settings/SecurityCard";
import { Role } from "@/generated/prisma/enums";
import { getSessionUser } from "@/lib/auth-guards";
import {
  AVATAR_STYLES,
  AVATAR_STYLE_IDS,
  isAvatarStyleId,
  renderAvatarDataUri,
} from "@/lib/avatar-styles";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Settings · Loving Hands Portal",
};

/**
 * The gallery is a fixed set, identical on every visit and for every person:
 * picking a face is a choice, not a lottery, so there is nothing to re-roll.
 * Twelve is enough to find one you like without becoming a contact sheet.
 */
const SEEDS = Array.from({ length: 12 }, (_, i) => `option-${i + 1}`);

export default async function SettingsPage() {
  const session = await getSessionUser();
  if (!session) redirect("/signin?next=/settings");

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      name: true,
      email: true,
      image: true,
      role: true,
      createdAt: true,
      avatarStyle: true,
      avatarSeed: true,
      passwordHash: true,
      passwordChangedAt: true,
    },
  });
  if (!user) redirect("/signin");

  // Rendered here, never in the browser: shipping the definitions to the
  // client would defeat the tree-shaking that keeps 57 unused styles out.
  const previews: StylePreview[] = AVATAR_STYLE_IDS.map((id) => ({
    id,
    label: AVATAR_STYLES[id].label,
    variants: SEEDS.map((seed) => renderAvatarDataUri(id, seed)),
  }));

  return (
    // Scoped to this route rather than the portal layout: `useSession().update()`
    // is what repaints the sidebar the moment a name or picture changes, and
    // /settings is the only screen that changes them.
    <SessionProvider>
      <div className="flex flex-col gap-lg">
        <h1 className="font-display text-[length:var(--text-heading-md)] text-ink">
          Settings
        </h1>

        <ProfileCard
          name={user.name}
          email={user.email}
          image={user.image}
          roleLabel={user.role === Role.SUPER_ADMIN ? "Super admin" : "Member"}
          createdAt={user.createdAt.toISOString()}
          seeds={SEEDS}
          previews={previews}
          currentStyle={
            user.avatarStyle && isAvatarStyleId(user.avatarStyle)
              ? user.avatarStyle
              : null
          }
          currentSeed={user.avatarSeed}
        />

        <SecurityCard
          hasPassword={Boolean(user.passwordHash)}
          passwordChangedAt={user.passwordChangedAt?.toISOString() ?? null}
        />
      </div>
    </SessionProvider>
  );
}

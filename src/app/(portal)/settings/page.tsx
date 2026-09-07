import type { Metadata } from "next";
import { redirect } from "next/navigation";
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

/** Enough to find one you like without becoming a contact sheet. */
const VARIANTS = 6;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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

  // Seeds live in the URL so Shuffle is a server round trip. Without them the
  // seed is the user's own name, so a first look is already personal.
  const params = await searchParams;
  const raw = typeof params.seeds === "string" ? params.seeds : "";
  const seeds = raw
    ? raw.split(",").filter(Boolean).slice(0, VARIANTS)
    : Array.from({ length: VARIANTS }, (_, i) => `${user.name}-${i}`);

  // Rendered here, never in the browser: shipping the definitions to the
  // client would defeat the tree-shaking that keeps 56 unused styles out.
  const previews: StylePreview[] = AVATAR_STYLE_IDS.map((id) => ({
    id,
    label: AVATAR_STYLES[id].label,
    variants: seeds.map((seed) => renderAvatarDataUri(id, seed)),
  }));

  // Only croodles carries one; the other four are CC0.
  const credited = AVATAR_STYLE_IDS.map((id) => AVATAR_STYLES[id]).find(
    (entry) => entry.attribution,
  );

  return (
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
        seeds={seeds}
        previews={previews}
        currentStyle={
          user.avatarStyle && isAvatarStyleId(user.avatarStyle)
            ? user.avatarStyle
            : null
        }
        currentSeed={user.avatarSeed}
        attribution={
          credited?.attribution
            ? {
                style: credited.label,
                name: credited.attribution.name,
                url: credited.attribution.url,
              }
            : null
        }
      />

      <SecurityCard
        hasPassword={Boolean(user.passwordHash)}
        passwordChangedAt={user.passwordChangedAt?.toISOString() ?? null}
      />
    </div>
  );
}

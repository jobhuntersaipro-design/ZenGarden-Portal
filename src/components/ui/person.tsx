import { Cog } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/avatar";
import { roleLabel } from "@/lib/permissions/roles";
import { SYSTEM_ACTOR } from "@/lib/system-actor";
import { cn } from "@/lib/utils";

export type PersonSize = "sm" | "md" | "lg";

const AVATAR_SIZE: Record<PersonSize, string> = {
  sm: "size-6",
  md: "size-8",
  lg: "size-24",
};

const GLYPH_SIZE: Record<PersonSize, string> = {
  sm: "size-3",
  md: "size-4",
  lg: "size-8",
};

/**
 * Re-exported so every caller of these components keeps one import. "System"
 * gets a neutral glyph rather than initials, so an automated event is never
 * mistaken for a colleague's action.
 */
export { SYSTEM_ACTOR };

export function PersonAvatar({
  name,
  image,
  size = "sm",
  className,
}: {
  name: string;
  image?: string | null;
  size?: PersonSize;
  className?: string;
}) {
  const isSystem = name === SYSTEM_ACTOR;
  return (
    <Avatar className={cn(AVATAR_SIZE[size], "shrink-0", className)}>
      {image && !isSystem ? <AvatarImage src={image} alt="" /> : null}
      <AvatarFallback className="bg-surface-soft text-[length:var(--text-caption)] text-ink">
        {isSystem ? (
          <Cog className={cn(GLYPH_SIZE[size], "text-ink-tertiary")} aria-hidden />
        ) : (
          initials(name)
        )}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * Avatar plus name, used everywhere the portal names a person. The name
 * truncates and always carries its full value in `title` (00-master.md §4).
 *
 * `role` is for the places that record *what somebody did* — a name beside an
 * action reads better with the job that action belongs to ("Warehouse", "QC"),
 * and on this portal the same avatar can be a super admin, a planner or a
 * buyer's own contact. It takes the `Role` enum rather than a string so every
 * screen keeps `roleLabel`'s one spelling. Left out — a roster row, a contact,
 * the System actor, which has no job — the chip is exactly as it was.
 */
export function PersonChip({
  name,
  image,
  role,
  size = "sm",
  className,
  nameClassName,
}: {
  name: string;
  image?: string | null;
  role?: Role | null;
  size?: PersonSize;
  className?: string;
  nameClassName?: string;
}) {
  const isSystem = name === SYSTEM_ACTOR;
  return (
    <span className={cn("flex min-w-0 items-center gap-xs", className)}>
      <PersonAvatar name={name} image={image} size={size} />
      <span className={cn("truncate", nameClassName)} title={name}>
        {name}
      </span>
      {role && !isSystem ? (
        <span className="shrink-0 text-[length:var(--text-caption)] text-ink-tertiary">
          {roleLabel(role)}
        </span>
      ) : null}
    </span>
  );
}

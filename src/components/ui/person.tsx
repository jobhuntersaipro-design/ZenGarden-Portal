import { Cog } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/avatar";
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
 */
export function PersonChip({
  name,
  image,
  size = "sm",
  className,
  nameClassName,
}: {
  name: string;
  image?: string | null;
  size?: PersonSize;
  className?: string;
  nameClassName?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-xs", className)}>
      <PersonAvatar name={name} image={image} size={size} />
      <span className={cn("truncate", nameClassName)} title={name}>
        {name}
      </span>
    </span>
  );
}

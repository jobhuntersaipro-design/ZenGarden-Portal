import { ExternalLink } from "lucide-react";
import { vesselSearchUrl } from "@/lib/vessel-tracking";

export const TRACKING_LINK =
  "inline-flex min-h-control-md items-center gap-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline sm:min-h-0";

/** "Track on VesselFinder" for a printed vessel; nothing when there is none. */
export function VesselLink({ vessel }: { vessel: string | null | undefined }) {
  const href = vessel ? vesselSearchUrl(vessel) : null;
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={TRACKING_LINK}>
      Track on VesselFinder
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

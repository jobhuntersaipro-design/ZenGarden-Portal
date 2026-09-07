import { Avatar, Style } from "@dicebear/core";
import clay from "@dicebear/styles/clay.json" with { type: "json" };
import gaze from "@dicebear/styles/gaze.json" with { type: "json" };
import notionists from "@dicebear/styles/notionists.json" with { type: "json" };
import voxelBot from "@dicebear/styles/voxel-bot.json" with { type: "json" };
import type { AvatarStyleId } from "@/lib/avatar-style-ids";

/**
 * Rendered locally, never from api.dicebear.com. Three reasons, all measured
 * rather than assumed: the API can be down or rate-limit; the seeds are user
 * names, which should not be handed to a third party; and gaze, voxel-bot and
 * clay are absent from the API's own /10.x index while shipping fine in npm,
 * so those endpoints are unlisted and could move without notice.
 *
 * Option names are `${component}Variant`, not the bare component name. The
 * components here are called `shape` and `animation`, but passing
 * `{ shape: [...] }` throws OptionsValidationError.
 */
export {
  AVATAR_STYLE_IDS,
  isAvatarStyleId,
  type AvatarStyleId,
} from "@/lib/avatar-style-ids";

/** Every style renders still; see the note on the module above. */
const STILL = { animationVariant: ["none"] } as const;

/** The seven geometric variants, omitting gaze's pill, column, egg and arch. */
const GAZE_SHAPES = [
  "circle",
  "square",
  "triangle",
  "pentagon",
  "hexagon",
  "octagon",
  "diamond",
] as const;

/** Every style offered here is CC0, so nothing needs a visible credit. */
export type StyleEntry = {
  label: string;
  blurb: string;
  style: Style;
  options: Record<string, unknown>;
};

// One Style per definition, built once at module scope. Passing a raw
// definition straight to Avatar is deprecated in 10.7.0 and removed in v11.
export const AVATAR_STYLES: Record<AvatarStyleId, StyleEntry> = {
  gaze: {
    label: "gaze",
    blurb: "Abstract geometric shape",
    style: new Style(gaze),
    options: { ...STILL, shapeVariant: [...GAZE_SHAPES] },
  },
  "voxel-bot": {
    label: "voxel-bot",
    blurb: "Blocky isometric robot",
    style: new Style(voxelBot),
    options: { ...STILL },
  },
  clay: {
    label: "clay",
    blurb: "Soft 3D clay render",
    style: new Style(clay),
    options: { ...STILL },
  },
  notionists: {
    label: "notionists",
    blurb: "Hand-drawn person",
    style: new Style(notionists),
    options: { ...STILL },
  },
};

/** SVG markup for one avatar. `size` is a square edge in px. */
export function renderAvatarSvg(
  id: AvatarStyleId,
  seed: string,
  size = 256,
): string {
  const entry = AVATAR_STYLES[id];
  return new Avatar(entry.style, {
    seed,
    size,
    ...entry.options,
  }).toString();
}

/** A `data:image/svg+xml` URI, for previews that never touch R2. */
export function renderAvatarDataUri(
  id: AvatarStyleId,
  seed: string,
  size = 96,
): string {
  const entry = AVATAR_STYLES[id];
  return new Avatar(entry.style, {
    seed,
    size,
    ...entry.options,
  }).toDataUri();
}

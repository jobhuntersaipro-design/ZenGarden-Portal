/**
 * Which component set draws the app: our shadcn primitives ("classic") or
 * Arc's (https://uiarc.dev, vendored in src/components/arc). Asked for on
 * 2026-10-01 as a side-by-side preview: "let me see the preview first, then I
 * will decide if we want to keep the old one". Spec:
 * docs/specs/61-arc-preview-switch.md.
 *
 * Imports nothing, so the proxy, server components and client components can
 * all read it.
 */
export type UiMode = "classic" | "arc";

export const UI_MODE_COOKIE = "zg-ui";

/** `?ui=arc` or `?ui=classic` on any URL sets the cookie (see src/proxy.ts). */
export const UI_MODE_PARAM = "ui";

export function parseUiMode(value: string | null | undefined): UiMode | null {
  return value === "arc" || value === "classic" ? value : null;
}

/**
 * Production never offers the switch and never draws Arc, whatever the
 * cookie says, so merging this cannot change what the team uses until the
 * choice is made. `ARC_PREVIEW=1` turns it on for a production build that
 * wants it; every other deployment (preview, development) has it on.
 */
type Env = Record<string, string | undefined>;

export function arcPreviewEnabled(env: Env = process.env): boolean {
  return env.ARC_PREVIEW === "1" || env.VERCEL_ENV !== "production";
}

/** The mode a request draws in. Classic unless the switch is on and the cookie says Arc. */
export function resolveUiMode(
  cookie: string | null | undefined,
  env?: Env,
): UiMode {
  return arcPreviewEnabled(env) && parseUiMode(cookie) === "arc" ? "arc" : "classic";
}

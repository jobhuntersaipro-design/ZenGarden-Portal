/**
 * Which component set draws the app: Arc's (https://uiarc.dev, vendored in
 * src/components/arc), or our earlier shadcn primitives ("classic"). Built on
 * 2026-10-01 as a side-by-side preview and settled the same day in Arc's
 * favour. Spec: docs/specs/61-arc-preview-switch.md.
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
 * Arc was chosen on 2026-10-01 ("keep Arc"), so every deployment draws Arc.
 * The switch back to Current is offered everywhere but production, where it
 * never appears and Arc is drawn whatever the cookie says. `ARC_PREVIEW=1`
 * offers it on a production build that wants it.
 */
type Env = Record<string, string | undefined>;

export function arcPreviewEnabled(env: Env = process.env): boolean {
  return env.ARC_PREVIEW === "1" || env.VERCEL_ENV !== "production";
}

/** The mode a request draws in. Arc unless the switch is on and the cookie says Current. */
export function resolveUiMode(
  cookie: string | null | undefined,
  env?: Env,
): UiMode {
  return arcPreviewEnabled(env) && parseUiMode(cookie) === "classic" ? "classic" : "arc";
}

import * as FLAGS from "country-flag-icons/string/3x2";

/** "indonesia" → "ID", from the runtime's own region names, so no list to keep. */
const display = new Intl.DisplayNames(["en"], { type: "region" });
const CODES = new Map<string, string>();
for (const code of Object.keys(FLAGS)) {
  if (code.length !== 2) continue;
  const name = display.of(code);
  if (name && name !== code) CODES.set(name.toLowerCase(), code);
}

const codeOf = (text: string | null | undefined) => (text ? CODES.get(text.trim().toLowerCase()) : undefined);

/**
 * The destination's flag as an SVG data URL, drawn as an image so Windows
 * (which prints flag emoji as two letters) shows the same flag. Read off the
 * shipment's market, else the last part of the port ("JAKARTA, INDONESIA").
 * A market that is a retailer ("Super Indo") and a port with no country
 * name get no flag rather than a guess.
 */
export function flagFor(market: string | null | undefined, port?: string | null): { code: string; src: string } | null {
  const code = codeOf(market) ?? codeOf(port?.split(",").at(-1));
  if (!code) return null;
  const svg = (FLAGS as Record<string, string>)[code];
  return svg ? { code, src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` } : null;
}

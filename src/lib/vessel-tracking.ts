/**
 * A BC prints a vessel with its voyage — "HG SKYLINE V. CS10G0S89",
 * "DANUM 172 / 72123W". A vessel search wants the ship's name alone.
 * ponytail: a heuristic on the printed text; an IMO/MMSI column if a BC ever
 * prints one and names stop matching.
 */
export function vesselName(printed: string): string {
  return printed
    .split("/")[0]
    .replace(/\s+(?:V\.|VOY\.?|VOYAGE|V)(?=[\s\d]|$).*$/i, "")
    .trim();
}

/** VesselFinder's own search for that name: live position, no key, no cost. */
export function vesselSearchUrl(printed: string): string | null {
  const name = vesselName(printed);
  return name ? `https://www.vesselfinder.com/vessels?name=${encodeURIComponent(name)}` : null;
}

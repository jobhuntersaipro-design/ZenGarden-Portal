import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const TOKENS_CSS = readFileSync(path.join(ROOT, "src/app/arc-tokens.css"), "utf8");
const DECLARED = new Set([...TOKENS_CSS.matchAll(/(--arc-[\w-]+)\s*:/g)].map((m) => m[1]));
const MANIFEST = JSON.parse(
  readFileSync(path.join(ROOT, "src/components/arc/tokens.json"), "utf8"),
) as { tokens: string[] };

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

const VENDORED = files(path.join(ROOT, "src/components/arc")).filter((f) =>
  /\.(css|tsx?)$/.test(f),
);

describe("arc-tokens.css", () => {
  it("defines every token the vendored Arc parts were renamed to read", () => {
    const missing = MANIFEST.tokens.filter((t) => !DECLARED.has(t));
    expect(missing).toEqual([]);
  });

  it("gives Arc a visible focus ring, where Arc ships a transparent one", () => {
    expect(TOKENS_CSS).toMatch(/--arc-focus-ring:\s*var\(--color-focus\)/);
  });

  it("reads our tokens rather than inventing colours", () => {
    expect(TOKENS_CSS.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(/i);
  });

  it("is not undone by a vendored file removing every outline", () => {
    for (const file of VENDORED) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/outline:\s*none\s*!important/);
    }
  });

  it("covers every foundation token a vendored file reads", () => {
    const read = new Set<string>();
    for (const file of VENDORED) {
      for (const m of readFileSync(file, "utf8").matchAll(/var\((--arc-[\w-]+)/g)) read.add(m[1]);
    }
    // A stem like `--arc-series-` comes from `var(--arc-series-${n})`, built
    // in a template; it is covered when some declared token extends it.
    const undefinedReads = [...read].filter((t) =>
      t.endsWith("-") ? ![...DECLARED].some((d) => d.startsWith(t)) : !DECLARED.has(t),
    );
    expect(undefinedReads).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  applyPatches,
  destination,
  foundationTokens,
  renameTokens,
  rewriteImports,
} from "./arc-import";

const TOKENS = foundationTokens(`
  :root { --accent: x; --text-sm: .875rem; --space-4: 1rem; --series-1: red; --series-2: blue; --arc-gradient: y; }
`);

describe("foundationTokens", () => {
  it("lists what the foundation declares, leaving names Arc already prefixed", () => {
    expect(TOKENS).toEqual(["accent", "text-sm", "space-4", "series-1", "series-2"]);
  });
});

describe("renameTokens", () => {
  it("prefixes a foundation token wherever it is read or set", () => {
    expect(renameTokens(".a { color: var(--accent); --accent: red; }", TOKENS)).toBe(
      ".a { color: var(--arc-accent); --arc-accent: red; }",
    );
  });

  it("matches whole names only, so a component's own variable survives", () => {
    expect(renameTokens("var(--accent-soft) var(--text-sm-2) var(--series)", TOKENS)).toBe(
      "var(--accent-soft) var(--text-sm-2) var(--series)",
    );
  });

  it("follows a series index built in a template string", () => {
    expect(renameTokens("`var(--series-${i + 1})` `--mesh-${i}`", TOKENS)).toBe(
      "`var(--arc-series-${i + 1})` `--mesh-${i}`",
    );
  });

  it("leaves Arc's own --arc-* gradient names alone", () => {
    expect(renameTokens("var(--arc-gradient)", TOKENS)).toBe("var(--arc-gradient)");
  });
});

describe("rewriteImports", () => {
  it("uses the radix-ui package this project already depends on", () => {
    expect(
      rewriteImports('import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";'),
    ).toBe('import { DropdownMenu as DropdownPrimitive } from "radix-ui";');
  });

  it("refuses a Radix package it has no name for, rather than guessing", () => {
    expect(() => rewriteImports('import * as X from "@radix-ui/react-menubar";')).toThrow();
  });

  it("points registry and lib imports into src/components/arc", () => {
    expect(
      rewriteImports(
        'from "@/registry/components/button/button"; from "@/registry/blocks/page-header/x"; from "@/lib/motion-tokens"; from "@/lib/utils"',
      ),
    ).toBe(
      'from "@/components/arc/button/button"; from "@/components/arc/blocks/page-header/x"; from "@/components/arc/lib/motion-tokens"; from "@/lib/utils"',
    );
  });
});

describe("destination", () => {
  it("never copies the foundation stylesheet, which removes every focus ring", () => {
    expect(destination("~/registry/foundation.css")).toBeNull();
  });

  it("maps components, blocks and helpers", () => {
    expect(destination("~/registry/components/tabs/tabs.tsx")).toBe("tabs/tabs.tsx");
    expect(destination("~/registry/blocks/page-header/page-header.tsx")).toBe(
      "blocks/page-header/page-header.tsx",
    );
    expect(destination("~/registry/motion-tokens.ts")).toBe("lib/motion-tokens.ts");
    expect(destination("~/lib/motion-tokens.ts")).toBeNull();
    expect(destination("~/lib/media.ts")).toBe("lib/media.ts");
  });
});

describe("applyPatches", () => {
  it("gives buttons the pill radius and leaves inputs at the control radius", () => {
    const css = ".b { border-radius: var(--arc-radius-control); }";
    expect(applyPatches("button/button.module.css", css)).toContain("--arc-radius-button");
    expect(applyPatches("input/input.module.css", css)).toBe(css);
  });
});

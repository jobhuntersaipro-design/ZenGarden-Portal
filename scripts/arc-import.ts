/**
 * Vendors Arc (https://uiarc.dev, MIT, github.com/kuratlielia/arc-library)
 * into src/components/arc, pinned to one commit.
 *
 *   npx tsx scripts/arc-import.ts            # fetch from GitHub at ARC_COMMIT
 *   npx tsx scripts/arc-import.ts --from dir # read registry JSON from dir/<name>.json
 *
 * What it changes on the way in, and why:
 *
 * - Arc's foundation.css is NOT copied. It ends with
 *   `:is(*:focus, *:focus-visible, *:focus-within) { outline: none !important }`
 *   and sets `--focus-ring: transparent` — no keyboard focus anywhere — and its
 *   token names (`--background`, `--accent`, `--border`, `--text-sm`,
 *   `--font-display`) are names shadcn and Tailwind already own here.
 * - Every foundation token is renamed `--x` → `--arc-x` in the CSS modules and
 *   the TSX, and `src/app/arc-tokens.css` defines the `--arc-*` set from our
 *   ClickUp `@theme` tokens. So Arc's parts wear our look: ink pill, purple
 *   focus ring, indigo shadows, Plus Jakarta Sans over Inter, 44px controls.
 * - Every CSS module is wrapped in `@layer arc`, declared between Tailwind's
 *   `base` and `components` (globals.css). An unlayered rule beats every
 *   layered one whatever its specificity, so left unlayered, Arc's
 *   `display`, `width` and `padding` overrode the Tailwind utilities a caller
 *   passes in `className` — `hidden sm:inline-flex` on a button stopped
 *   hiding it. In the layer, a caller's utilities win and preflight does not.
 * - `@radix-ui/react-*` imports become the `radix-ui` package this project
 *   already depends on; `@/registry/...` and `@/lib/...` become
 *   `@/components/arc/...`.
 *
 * Files are overwritten on every run. Edit this script, not the output.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const ARC_COMMIT = "cde1b4031f6e76f08f1e3da8510e6b952d087069";
const RAW = `https://raw.githubusercontent.com/kuratlielia/arc-library/${ARC_COMMIT}`;
const OUT = path.join(process.cwd(), "src/components/arc");

/**
 * The parts with a job in this portal. What was left out, and why, is in
 * docs/specs/60-arc-foundation.md §3.
 */
export const ARC_ITEMS = [
  // actions
  "button", "action-button", "split-button", "dropdown-menu", "copy-button",
  "confirm-morph", "swipe-actions", "user-menu",
  // inputs
  "input", "textarea", "password-field", "password-strength", "search-field",
  "inline-edit", "number-field", "phone-input", "select", "combobox",
  "multi-select", "chip-group", "checkbox", "radio-group", "radio-cards",
  "switch", "segmented-control", "calendar", "date-picker", "date-range-picker",
  "file-dropzone",
  // navigation and overlays
  "tabs", "breadcrumb", "pagination", "scroll-area", "accordion",
  "resizable-panels", "dialog", "drawer", "bottom-sheet", "popover",
  "hover-card", "tooltip",
  // feedback
  "alert", "toast", "toast-stack", "progress", "skeleton", "stepper",
  // data
  "avatar", "avatar-group", "badge", "card", "metric-card", "empty-state",
  "line-chart", "bar-chart", "donut-chart", "slope-chart", "sparkline", "gauge",
  "activity-heatmap", "animated-counter", "sortable-data-table", "tree-view",
  "filter-toolbar", "timeline", "carousel",
  // text
  "text-morph", "text-shimmer",
  // blocks
  "page-header", "command-palette", "notification-center", "empty-states",
  "file-upload",
] as const;

const RADIX: Record<string, string> = {
  accordion: "Accordion",
  checkbox: "Checkbox",
  dialog: "Dialog",
  "dropdown-menu": "DropdownMenu",
  popover: "Popover",
  select: "Select",
  switch: "Switch",
  tabs: "Tabs",
  tooltip: "Tooltip",
};

/**
 * Deliberate departures from Arc, applied after the rename. Each one names the
 * rule of ours it serves; keep the list short.
 */
export const PATCHES: { file: RegExp; apply: (source: string) => string; why: string }[] = [
  {
    file: /^(button|action-button|split-button)\/.*\.css$/,
    apply: (source) => source.replace(/--arc-radius-control\b/g, "--arc-radius-button"),
    why: "A button is the 20px pill; Arc gives buttons and inputs one radius, ours are 20px and 9px.",
  },
  {
    file: /^(line-chart|bar-chart|donut-chart)\/[\w-]+\.tsx$/,
    apply: wrapScreenReaderTable,
    why:
      "A table ignores `width: 1px`, so each chart's screen-reader table spread to its content width and pushed a 390px page to 436. A div holding it clips; the table keeps its semantics.",
  },
  {
    file: /^gauge\/gauge\.tsx$/,
    apply: (source) =>
      replaceOnce(
        source,
        "const sweep = useMotionValue(0);\n  const count = useMotionValue(0);",
        "const sweep = useMotionValue(percentage);\n  const count = useMotionValue(percentage * 100);",
      ),
    why: "A figure never renders zero on first paint (00-master §4). Arc's gauge fills from 0 when it scrolls into view; it starts at its value instead and still springs to every later one.",
  },
  {
    file: /^password-field\/password-field\.tsx$/,
    apply: (source) => replaceOnce(source, "\nfunction EyeMorph(", "\nexport function EyeMorph("),
    why: "Our PasswordInput keeps its own label and per-field toggle names (\"Show current password\") and draws Arc's shell around them; it needs Arc's eye.",
  },
  {
    file: /^phone-input\/phone-input\.tsx$/,
    apply: (source) =>
      replaceOnce(
        source,
        '  country("SG", "Singapore",',
        '  country("MY", "Malaysia", "60", ["##-### ####", "##-#### ####"], "123456789"),\n  country("SG", "Singapore",',
      ),
    why: "Arc's country list has no Malaysia, and every buyer and contact here is Malaysian first: 012-345 6789 is +60 12-345 6789, and 011 numbers carry one digit more.",
  },
  {
    file: /^command-palette\/command-palette\.tsx$/,
    apply: (source) =>
      replaceOnce(
        replaceOnce(source, "if (!normalized) return items;", "if (!normalized) return items.slice(0, 50);"),
        '.toLowerCase().includes(normalized));',
        ".toLowerCase().includes(normalized)).slice(0, 50);",
      ),
    why: "Our palette indexes hundreds of purchase orders, buyers and products, and Arc animates every row it lists; past fifty rows, typing narrows faster than scrolling.",
  },
  {
    file: /^notification-center\/notification-center\.tsx$/,
    apply: (source) =>
      replaceOnce(
        replaceOnce(
          replaceOnce(
            source,
            "export interface NotificationCenterProps {",
            "export interface NotificationCenterProps {\n  /** Adds Open to an expanded update, for one that leads somewhere. */\n  onOpenItem?: (notification: NotificationItem) => void;",
          ),
          "onReadChange, onDismiss, open,",
          "onReadChange, onDismiss, onOpenItem, open,",
        ),
        "<div className={styles.itemActions}>",
        "<div className={styles.itemActions}>{onOpenItem && <button type=\"button\" onClick={() => onOpenItem(item)}>Open</button>}",
      ),
    why: "Arc's updates can be read and dismissed but lead nowhere; ours are orders waiting on the team, and each one needs a way to its review screen.",
  },
  {
    file: /^tree-view\/tree-view\.tsx$/,
    apply: (source) => replaceOnce(source, "const rowHeight = 38;", "const rowHeight = 46;"),
    why: "A tree row is a touch target: 44px with its 2px gap, not 36, so a phone keeps the 44px floor. The row height is animated in JS, so CSS alone would let rows overlap.",
  },
  {
    file: /^tree-view\/tree-view\.module\.css$/,
    apply: (source) => replaceOnce(source, "height: 36px; margin-top: 2px;", "height: 44px; margin-top: 2px;"),
    why: "The row itself, to match the 46px the TSX animates each row to.",
  },
];

/** `source.replace` that refuses to do nothing, so an upstream change cannot silently drop a patch. */
export function replaceOnce(source: string, from: string, to: string): string {
  if (!source.includes(from)) throw new Error(`patch is stale: ${JSON.stringify(from.slice(0, 60))} not found`);
  return source.replace(from, to);
}

/** `<table className={styles.srOnly}>…</table>` → `<div className={styles.srOnly}><table>…</table></div>`. */
export function wrapScreenReaderTable(source: string): string {
  const open = "<table className={styles.srOnly}>";
  const at = source.indexOf(open);
  if (at === -1) throw new Error("wrapScreenReaderTable: no screen-reader table; the patch is stale");
  const close = source.indexOf("</table>", at);
  if (close === -1) throw new Error("wrapScreenReaderTable: unclosed table");
  return (
    source.slice(0, at) +
    "<div className={styles.srOnly}><table>" +
    source.slice(at + open.length, close) +
    "</table></div>" +
    source.slice(close + "</table>".length)
  );
}

export function applyPatches(dest: string, source: string): string {
  return PATCHES.reduce((out, p) => (p.file.test(dest) ? p.apply(out) : out), source);
}

type RegistryFile = { path: string; target?: string; content: string };
type RegistryItem = { name: string; files: RegistryFile[]; registryDependencies?: string[] };

async function load(name: string, from: string | null): Promise<RegistryItem> {
  if (from) return JSON.parse(await readFile(path.join(from, `${name}.json`), "utf8"));
  const res = await fetch(`${RAW}/public/r/${name}.json`);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return (await res.json()) as RegistryItem;
}

/** Every custom property the foundation declares, e.g. `accent`, `space-4`. */
export function foundationTokens(css: string): string[] {
  const names = new Set<string>();
  for (const m of css.matchAll(/--([a-z][\w-]*)\s*:/g)) names.add(m[1]);
  return [...names].filter((n) => !n.startsWith("arc-"));
}

/** `--accent` → `--arc-accent`, whole names only; `--series-${n}` too. */
export function renameTokens(source: string, tokens: string[]): string {
  const set = new Set(tokens);
  const prefixes = new Set(tokens.map((t) => t.replace(/-[^-]+$/, "")));
  return source
    .replace(/--([a-z][\w-]*)\$\{/g, (whole, stem: string) =>
      prefixes.has(stem.replace(/-$/, "")) ? `--arc-${stem}\${` : whole,
    )
    .replace(/(?<![\w-])--([a-z][\w-]*)(?![\w-])/g, (whole, name: string) =>
      set.has(name) ? `--arc-${name}` : whole,
    );
}

export function rewriteImports(source: string): string {
  return source
    .replace(
      /import \* as (\w+) from "@radix-ui\/react-([\w-]+)";/g,
      (whole, alias: string, pkg: string) => {
        const exported = RADIX[pkg];
        if (!exported) throw new Error(`No radix-ui export for @radix-ui/react-${pkg}`);
        return `import { ${exported} as ${alias} } from "radix-ui";`;
      },
    )
    .replace(/@\/registry\/components\//g, "@/components/arc/")
    .replace(/@\/registry\/blocks\//g, "@/components/arc/blocks/")
    .replace(/@\/lib\/(motion-tokens|media|use-copy-feedback)\b/g, "@/components/arc/lib/$1");
}

/** Where a registry target lands under src/components/arc, or null to skip. */
export function destination(target: string): string | null {
  const t = target.replace(/^~\//, "");
  if (t === "registry/foundation.css") return null;
  if (t === "lib/motion-tokens.ts") return null; // re-export shim; the real file is registry/motion-tokens.ts
  if (t === "registry/motion-tokens.ts") return "lib/motion-tokens.ts";
  if (t.startsWith("lib/")) return t;
  if (t.startsWith("registry/components/")) return t.slice("registry/components/".length);
  if (t.startsWith("registry/blocks/")) return `blocks/${t.slice("registry/blocks/".length)}`;
  throw new Error(`Unmapped target ${target}`);
}

const HEADER_TS = `// Vendored from Arc (MIT, see ../LICENSE) at ${ARC_COMMIT.slice(0, 7)} by scripts/arc-import.ts. Do not edit; re-run the script.\n`;
const HEADER_CSS = `/* Vendored from Arc (MIT) at ${ARC_COMMIT.slice(0, 7)} by scripts/arc-import.ts. Tokens renamed --x → --arc-x; see src/app/arc-tokens.css. */\n`;

/** The cascade order globals.css declares; repeated in each module so whichever file loads first sets the same order. */
export const LAYER_ORDER = "@layer theme, base, arc, components, utilities;";

/** A module's rules inside `@layer arc`, so Tailwind utilities a caller passes still win. */
export function layerCss(content: string): string {
  return `${LAYER_ORDER}\n@layer arc {\n${content.replace(/\s+$/, "")}\n}\n`;
}

function withHeader(file: string, content: string): string {
  if (file.endsWith(".css")) return HEADER_CSS + layerCss(content);
  // "use client" must stay the first statement.
  const m = content.match(/^(["']use client["'];?\s*\n)/);
  return m ? m[1] + HEADER_TS + content.slice(m[1].length) : HEADER_TS + content;
}

async function main() {
  const fromIndex = process.argv.indexOf("--from");
  const from = fromIndex > -1 ? process.argv[fromIndex + 1] : null;

  const foundation = await load("arc-foundation", from);
  const css = foundation.files.find((f) => f.path.endsWith("foundation.css"));
  if (!css) throw new Error("arc-foundation has no foundation.css");
  const tokens = foundationTokens(css.content);

  await rm(OUT, { recursive: true, force: true });
  const written: string[] = [];
  for (const name of ["arc-foundation", ...ARC_ITEMS]) {
    const item = name === "arc-foundation" ? foundation : await load(name, from);
    for (const file of item.files) {
      const dest = destination(file.target ?? `~/${file.path}`);
      if (!dest) continue;
      const out = withHeader(dest, applyPatches(dest, rewriteImports(renameTokens(file.content, tokens))));
      const abs = path.join(OUT, dest);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, out);
      written.push(dest);
    }
  }
  const license = from
    ? await readFile(path.join(from, "..", "LICENSE"), "utf8")
    : await (await fetch(`${RAW}/LICENSE`)).text();
  await writeFile(path.join(OUT, "LICENSE"), license);
  await writeFile(
    path.join(OUT, "tokens.json"),
    JSON.stringify({ commit: ARC_COMMIT, tokens: tokens.map((t) => `--arc-${t}`) }, null, 2) + "\n",
  );
  console.log(`${written.length} files from ${ARC_ITEMS.length} items, ${tokens.length} tokens renamed.`);
}

if (process.argv[1]?.endsWith("arc-import.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

# Account Settings and Person Avatars — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every user a `/settings` page where they manage their own picture, display name, password and sessions, and show a person's picture beside their name everywhere the portal names one.

**Architecture:** `User.image` stays a URL whatever its source, so all existing render sites work unchanged. Pictures — whether an uploaded photo or a locally-generated DiceBear avatar — become a 256×256 WebP in R2 behind one stable, immutably-cached URL keyed by a content hash. One `PersonChip` component replaces six copies of an `initials` helper.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 (CSS `@theme` tokens), Prisma 7 on Neon, Cloudflare R2 via `@aws-sdk/client-s3`, `sharp`, `@dicebear/core` + `@dicebear/styles`, Auth.js v5, Vitest.

**Spec:** `docs/specs/10-settings-and-avatars.md` — read it before starting. `docs/specs/00-master.md` §4 carries the design conventions every task must honour.

## Global Constraints

- **TypeScript strict. No `any`** — use `unknown` and narrow. Interfaces for all props and API responses.
- **Tailwind v4, CSS config only.** Never create `tailwind.config.ts`. All tokens live in `src/app/globals.css` under `@theme`.
- **No raw hex, no px font size, no arbitrary Tailwind value** (`bg-[#292d34]`, `text-[15px]`) in any component. If a token is missing, add it to `@theme` first and say so.
- **Panel widths use `max-w-panel-xs|sm|md|lg`, never `max-w-sm`.** Tailwind v4 resolves `max-w-<name>` against `--spacing-<name>` first, and this system names spacing steps `xs/sm/md/lg`, so `max-w-sm` compiles to **12px**.
- **Focus rings use `--color-focus`** (`outline-focus`), never `--color-primary`, which is rebound to ink.
- **Server Components by default.** `"use client"` only for interactivity. Server Actions for mutations; route handlers only for file upload and binary serving.
- **Every Server Action** starts with `await requireUser()`, validates with a Zod schema from `src/lib/validation/`, wraps in try/catch, and returns `{ success: true, data } | { success: false, error }`. Never throws to the client.
- **Sentence case** for eyebrows, field labels and column headers, in `font-mono text-eyebrow text-ink-tertiary`, not uppercased.
- **Truncated text always carries a `title`** with the full value.
- **Tests are Vitest, node environment**, colocated as `src/**/*.test.ts`. There is no `@testing-library/react` in this project — **do not write React component tests**; test pure functions and Server Actions only, mocking `@/lib/prisma` and `@/lib/auth-guards` in the style of `src/actions/users.test.ts`.
- **Prisma migrations use `prisma migrate dev`**, never `db push`.
- **`npm run build` and `npm run lint` must pass before any commit.**
- **Never put "Generated with Claude" in a commit message.** Conventional commits (`feat:`, `fix:`, `chore:`).
- **Display names allow 1–120 characters**, matching `createUserSchema` in `src/lib/validation/users.ts`.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/lib/avatar.ts` | `initials()`, `avatarObjectKey()`, `avatarUrl()` — pure, no I/O |
| `src/lib/avatar.test.ts` | tests for the above |
| `src/lib/avatar-styles.ts` | the five DiceBear `Style` instances and their render options |
| `src/lib/avatar-styles.test.ts` | rendering, determinism, animation and shape pinning |
| `src/lib/validation/profile.ts` | `displayNameSchema`, avatar file rules, `AVATAR_STYLE_IDS` |
| `src/lib/validation/profile.test.ts` | tests for the above |
| `src/lib/avatar-store.ts` | `storeAvatar()` — SVG/bytes → sharp → R2 → row update |
| `src/components/ui/person.tsx` | `PersonChip` — the one avatar+name component |
| `src/app/api/avatars/[userId]/route.ts` | `GET` — streams the stored WebP |
| `src/app/api/avatars/route.ts` | `POST` — multipart photo upload |
| `src/actions/profile.ts` | `updateProfile`, `setGeneratedAvatar`, `removeAvatar`, `useGooglePhoto`, `signOutEverywhere` |
| `src/actions/profile.test.ts` | tests for the above |
| `src/app/(portal)/settings/page.tsx` | Server Component, reads the row |
| `src/app/(portal)/settings/loading.tsx` | route skeleton |
| `src/components/settings/ProfileCard.tsx` | name + picture, client |
| `src/components/settings/AvatarPicker.tsx` | upload / style / variants / Google |
| `src/components/settings/SecurityCard.tsx` | password + sessions, client |

**Modified**

| File | Change |
|---|---|
| `prisma/schema.prisma` | `avatarKey`, `avatarStyle`, `avatarSeed`, `passwordChangedAt` on `User` |
| `src/components/portal/UserMenu.tsx` | use `PersonChip`; add a Settings item |
| `src/components/admin/UsersTable.tsx` | use `PersonChip`, drop local `initials` |
| `src/components/purchase-orders/PoTable.tsx` | `Person` becomes `PersonChip` |
| `src/app/(admin)/layout.tsx` | use `PersonChip`, drop local `initials` |
| `src/app/(auth)/signin/pending/page.tsx` | use `initials` from `@/lib/avatar` |
| `src/components/products/ProductThumb.tsx` | use `initials` from `@/lib/avatar` |
| `src/components/purchase-orders/ActivityList.tsx` | avatars on every actor |
| `src/app/(portal)/purchase-orders/[id]/page.tsx` | select `image`; avatars on two rows |
| `src/app/(auth)/account/password/page.tsx` | redirect when not forced |
| `src/actions/auth.ts` | write `passwordChangedAt` |
| `src/actions/users.ts` | write `passwordChangedAt` |

---

## Task 1: Schema, migration, and the pure avatar helpers

**Files:**
- Modify: `prisma/schema.prisma` (the `User` model)
- Create: `src/lib/avatar.ts`
- Test: `src/lib/avatar.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `initials(name: string): string`
  - `avatarObjectKey(userId: string, hash: string): string`
  - `avatarUrl(userId: string, hash: string): string`
  - `contentHash(bytes: Uint8Array): string` — 12 lowercase hex chars
  - `User.avatarKey`, `User.avatarStyle`, `User.avatarSeed`, `User.passwordChangedAt`

- [ ] **Step 1: Add the columns**

In `prisma/schema.prisma`, inside `model User`, after the `image` line:

```prisma
  image              String?
  avatarKey          String?                   // R2 object key for the stored picture
  avatarStyle        String?                   // DiceBear style id, when generated
  avatarSeed         String?                   // the seed that generated it
  passwordChangedAt  DateTime?                 // when passwordHash was last written
```

- [ ] **Step 2: Run the migration**

```bash
npx prisma migrate dev --name settings_and_avatars
```

Expected: a new folder under `prisma/migrations/`, and `npx prisma migrate status` reports the schema in sync.

- [ ] **Step 3: Write the failing test**

Create `src/lib/avatar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { avatarObjectKey, avatarUrl, contentHash, initials } from "@/lib/avatar";

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Aisha Rahman")).toBe("AR");
  });

  it("stops at two even with more words", () => {
    expect(initials("Wei Ling Tan")).toBe("WL");
  });

  it("handles a single word", () => {
    expect(initials("Prince")).toBe("P");
  });

  it("ignores runs of whitespace rather than emitting blanks", () => {
    expect(initials("  Aisha   Rahman  ")).toBe("AR");
  });

  it("returns an empty string for an empty or whitespace-only name", () => {
    expect(initials("")).toBe("");
    expect(initials("   ")).toBe("");
  });

  it("uppercases", () => {
    expect(initials("aisha rahman")).toBe("AR");
  });

  it("keeps non-Latin letters as they are", () => {
    expect(initials("陈 伟")).toBe("陈伟");
  });
});

describe("avatar keys and urls", () => {
  it("builds a foldered key with the hash in the filename", () => {
    expect(avatarObjectKey("clx123", "a91f2b3c4d5e")).toBe(
      "avatars/clx123/a91f2b3c4d5e.webp",
    );
  });

  it("builds a url carrying the hash as a cache buster", () => {
    expect(avatarUrl("clx123", "a91f2b3c4d5e")).toBe(
      "/api/avatars/clx123?v=a91f2b3c4d5e",
    );
  });

  it("hashes to twelve lowercase hex characters", () => {
    const hash = contentHash(new Uint8Array([1, 2, 3]));
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it("hashes the same bytes to the same value and different bytes differently", () => {
    expect(contentHash(new Uint8Array([1, 2, 3]))).toBe(
      contentHash(new Uint8Array([1, 2, 3])),
    );
    expect(contentHash(new Uint8Array([1, 2, 3]))).not.toBe(
      contentHash(new Uint8Array([1, 2, 4])),
    );
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

```bash
npx vitest run src/lib/avatar.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/avatar"`.

- [ ] **Step 5: Write the implementation**

Create `src/lib/avatar.ts`:

```ts
import { createHash } from "node:crypto";

/**
 * The two-letter monogram shown when someone has no picture. Splitting on a
 * whitespace run rather than a single space is what keeps "Aisha   Rahman"
 * from yielding an empty middle part.
 *
 * Lived in six files before this one — UserMenu, UsersTable, PoTable, the
 * admin layout, signin/pending and ProductThumb.
 */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => [...part][0] ?? "")
    .join("")
    .toUpperCase();
}

/** Twelve hex characters is ample to tell one picture from the next. */
export function contentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 12);
}

/** `avatars/{userId}/{hash}.webp` — foldered per user so a listing is usable. */
export function avatarObjectKey(userId: string, hash: string): string {
  return `avatars/${userId}/${hash}.webp`;
}

/**
 * What goes in `User.image`. The `?v=` is load-bearing: it is what makes the
 * serve route's `immutable` cache header safe, because a changed picture is a
 * different URL rather than the same URL with new bytes.
 */
export function avatarUrl(userId: string, hash: string): string {
  return `/api/avatars/${userId}?v=${hash}`;
}
```

- [ ] **Step 6: Run it and watch it pass**

```bash
npx vitest run src/lib/avatar.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/avatar.ts src/lib/avatar.test.ts
git commit -m "feat: add avatar columns and the shared avatar helpers"
```

---

## Task 2: The five DiceBear styles

**Files:**
- Modify: `package.json` (two dependencies)
- Create: `src/lib/avatar-styles.ts`
- Test: `src/lib/avatar-styles.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `AVATAR_STYLES: Record<AvatarStyleId, { label: string; blurb: string; style: Style; options: Record<string, unknown> }>`
  - `AVATAR_STYLE_IDS: readonly AvatarStyleId[]`
  - `type AvatarStyleId = "gaze" | "voxel-bot" | "clay" | "croodles" | "notionists"`
  - `renderAvatarSvg(id: AvatarStyleId, seed: string, size?: number): string`
  - `isAvatarStyleId(value: string): value is AvatarStyleId`

- [ ] **Step 1: Install the dependencies**

```bash
npm install @dicebear/core@10.7.0 @dicebear/styles@10.6.0
```

Both pinned exactly. `@dicebear/core` is MIT; `@dicebear/styles` carries a per-style licence — four of the five below are CC0 and `croodles` is CC BY 4.0, which is why §3 of the spec requires a visible credit.

- [ ] **Step 2: Write the failing test**

Create `src/lib/avatar-styles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  AVATAR_STYLE_IDS,
  isAvatarStyleId,
  renderAvatarSvg,
} from "@/lib/avatar-styles";

const SEED = "Aisha Rahman";

describe("avatar styles", () => {
  it("offers exactly the five styles the spec names", () => {
    expect([...AVATAR_STYLE_IDS]).toEqual([
      "gaze",
      "voxel-bot",
      "clay",
      "croodles",
      "notionists",
    ]);
  });

  it("renders svg markup for every style", () => {
    for (const id of AVATAR_STYLE_IDS) {
      const svg = renderAvatarSvg(id, SEED);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.length).toBeGreaterThan(200);
    }
  });

  it("is deterministic — the same style and seed give identical markup", () => {
    for (const id of AVATAR_STYLE_IDS) {
      expect(renderAvatarSvg(id, SEED)).toBe(renderAvatarSvg(id, SEED));
    }
  });

  it("gives different seeds different markup", () => {
    expect(renderAvatarSvg("clay", "Aisha Rahman")).not.toBe(
      renderAvatarSvg("clay", "Priya Nair"),
    );
  });

  // gaze, voxel-bot and clay all carry @keyframes in their definitions. The
  // SVG is rasterized, so an animation left free means sharp captures an
  // arbitrary frame.
  it("never emits an animation", () => {
    for (const id of AVATAR_STYLE_IDS) {
      expect(renderAvatarSvg(id, SEED)).not.toContain("@keyframes");
    }
  });

  it("restricts gaze to the seven geometric shapes", () => {
    // 200 seeds is enough to hit every variant many times over; the four
    // excluded shapes have distinctive path data, so any leak shows up as a
    // rendered avatar we did not sanction.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(renderAvatarSvg("gaze", `seed-${i}`));
    expect(seen.size).toBeGreaterThan(1);
  });

  // A DiceBear upgrade that renames an option must fail here rather than
  // silently drop the pin.
  it("throws on an unknown option key", async () => {
    const { Avatar } = await import("@dicebear/core");
    const { AVATAR_STYLES } = await import("@/lib/avatar-styles");
    expect(
      () => new Avatar(AVATAR_STYLES.gaze.style, { seed: SEED, notAnOption: 1 }),
    ).toThrow();
  });

  it("recognises its own ids and rejects others", () => {
    expect(isAvatarStyleId("clay")).toBe(true);
    expect(isAvatarStyleId("lorelei")).toBe(false);
    expect(isAvatarStyleId("")).toBe(false);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
npx vitest run src/lib/avatar-styles.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/avatar-styles"`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/avatar-styles.ts`:

```ts
import { Avatar, Style } from "@dicebear/core";
import clay from "@dicebear/styles/clay.json" with { type: "json" };
import croodles from "@dicebear/styles/croodles.json" with { type: "json" };
import gaze from "@dicebear/styles/gaze.json" with { type: "json" };
import notionists from "@dicebear/styles/notionists.json" with { type: "json" };
import voxelBot from "@dicebear/styles/voxel-bot.json" with { type: "json" };

/**
 * Rendered locally, never from api.dicebear.com. Three reasons, all measured:
 * the API can be down or rate-limit; seeds are user names, which should not be
 * handed to a third party; and gaze, voxel-bot and clay are absent from the
 * API's own /10.x index while shipping fine in npm, so those endpoints are
 * unlisted and could move without notice.
 *
 * Option names are `${component}Variant`, not the bare component name — the
 * components here are called `shape` and `animation`, but passing
 * `{ shape: [...] }` throws `OptionsValidationError`.
 */
export const AVATAR_STYLE_IDS = [
  "gaze",
  "voxel-bot",
  "clay",
  "croodles",
  "notionists",
] as const;

export type AvatarStyleId = (typeof AVATAR_STYLE_IDS)[number];

/** Every style is rendered still; see the animationVariant note above. */
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

type StyleEntry = {
  label: string;
  blurb: string;
  /** CC0 styles need no credit; croodles does. */
  attribution: { name: string; url: string } | null;
  style: Style;
  options: Record<string, unknown>;
};

// One Style per definition, built once at module scope. Passing a raw
// definition straight to Avatar is deprecated in 10.7.0 and removed in v11.
export const AVATAR_STYLES: Record<AvatarStyleId, StyleEntry> = {
  gaze: {
    label: "gaze",
    blurb: "Abstract geometric shape",
    attribution: null,
    style: new Style(gaze),
    options: { ...STILL, shapeVariant: [...GAZE_SHAPES] },
  },
  "voxel-bot": {
    label: "voxel-bot",
    blurb: "Blocky isometric robot",
    attribution: null,
    style: new Style(voxelBot),
    options: { ...STILL },
  },
  clay: {
    label: "clay",
    blurb: "Soft 3D clay render",
    attribution: null,
    style: new Style(clay),
    options: { ...STILL },
  },
  croodles: {
    label: "croodles",
    blurb: "Hand-drawn doodle face",
    attribution: {
      name: "vijay verma",
      url: "https://www.instagram.com/vijay_verma.zip/",
    },
    style: new Style(croodles),
    options: { ...STILL },
  },
  notionists: {
    label: "notionists",
    blurb: "Hand-drawn person",
    attribution: null,
    style: new Style(notionists),
    options: { ...STILL },
  },
};

export const isAvatarStyleId = (value: string): value is AvatarStyleId =>
  (AVATAR_STYLE_IDS as readonly string[]).includes(value);

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
```

- [ ] **Step 5: Run it and watch it pass**

```bash
npx vitest run src/lib/avatar-styles.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/avatar-styles.ts src/lib/avatar-styles.test.ts
git commit -m "feat: render the five DiceBear avatar styles locally"
```

---

## Task 3: Profile validation

**Files:**
- Create: `src/lib/validation/profile.ts`
- Test: `src/lib/validation/profile.test.ts`

**Interfaces:**
- Consumes: `AvatarStyleId`, `isAvatarStyleId` from Task 2.
- Produces:
  - `displayNameSchema: z.ZodString`
  - `updateProfileSchema` — `{ name: string }`
  - `generatedAvatarSchema` — `{ style: AvatarStyleId; seed: string }`
  - `AVATAR_MAX_BYTES`, `AVATAR_MAX_DIMENSION`, `AVATAR_ACCEPT_ATTRIBUTE`
  - `isAvatarMimeType(value: string): value is AvatarMimeType`
  - `avatarRejectionReason(input: { type: string; size: number }): string | null`
  - `AVATAR_TOO_LARGE`, `AVATAR_WRONG_TYPE`, `AVATAR_TOO_BIG_DIMENSIONS`

- [ ] **Step 1: Write the failing test**

Create `src/lib/validation/profile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  AVATAR_MAX_BYTES,
  avatarRejectionReason,
  displayNameSchema,
  generatedAvatarSchema,
} from "@/lib/validation/profile";

describe("displayNameSchema", () => {
  it("trims surrounding whitespace", () => {
    expect(displayNameSchema.parse("  Aisha Rahman  ")).toBe("Aisha Rahman");
  });

  it("rejects an empty name", () => {
    expect(displayNameSchema.safeParse("").success).toBe(false);
  });

  it("rejects a whitespace-only name", () => {
    expect(displayNameSchema.safeParse("    ").success).toBe(false);
  });

  it("accepts 120 characters and rejects 121", () => {
    expect(displayNameSchema.safeParse("a".repeat(120)).success).toBe(true);
    expect(displayNameSchema.safeParse("a".repeat(121)).success).toBe(false);
  });
});

describe("generatedAvatarSchema", () => {
  it("accepts one of the five styles", () => {
    const result = generatedAvatarSchema.safeParse({
      style: "clay",
      seed: "Aisha Rahman",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a style outside the five, even a real DiceBear one", () => {
    expect(
      generatedAvatarSchema.safeParse({ style: "lorelei", seed: "x" }).success,
    ).toBe(false);
  });

  it("rejects an empty seed", () => {
    expect(
      generatedAvatarSchema.safeParse({ style: "clay", seed: "" }).success,
    ).toBe(false);
  });
});

describe("avatarRejectionReason", () => {
  it("accepts a reasonable jpeg", () => {
    expect(avatarRejectionReason({ type: "image/jpeg", size: 2_000_000 })).toBeNull();
  });

  it("accepts png and webp", () => {
    expect(avatarRejectionReason({ type: "image/png", size: 1000 })).toBeNull();
    expect(avatarRejectionReason({ type: "image/webp", size: 1000 })).toBeNull();
  });

  it("rejects a pdf, naming what is allowed", () => {
    const reason = avatarRejectionReason({ type: "application/pdf", size: 1000 });
    expect(reason).toContain("PNG");
  });

  it("rejects a file over the cap, naming the actual size", () => {
    const reason = avatarRejectionReason({
      type: "image/png",
      size: AVATAR_MAX_BYTES + 1,
    });
    expect(reason).toContain("5.0 MB");
  });

  it("rejects an empty file", () => {
    expect(avatarRejectionReason({ type: "image/png", size: 0 })).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/lib/validation/profile.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/validation/profile"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/validation/profile.ts`:

```ts
import { z } from "zod";
import { AVATAR_STYLE_IDS } from "@/lib/avatar-styles";
import { formatBytes } from "@/lib/validation/upload";

/**
 * 120 matches `createUserSchema` in `src/lib/validation/users.ts`, so a name a
 * super admin can set is a name its owner can keep.
 */
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name")
  .max(120, "That name is too long — 120 characters at most");

export const updateProfileSchema = z.object({ name: displayNameSchema });

export const generatedAvatarSchema = z.object({
  style: z.enum(AVATAR_STYLE_IDS),
  seed: z.string().trim().min(1).max(120),
});

export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
export type GeneratedAvatarInput = z.input<typeof generatedAvatarSchema>;

export const AVATAR_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number];

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** Claude rejects images over 8000px a side; so do we, before anyone waits. */
export const AVATAR_MAX_DIMENSION = 8000;

export const AVATAR_ACCEPT_ATTRIBUTE = ".png,.jpg,.jpeg,.webp";

export const isAvatarMimeType = (value: string): value is AvatarMimeType =>
  (AVATAR_MIME_TYPES as readonly string[]).includes(value);

// Plain language, in the house style of `src/lib/validation/upload.ts`: the
// size case names the actual size, because "too large" alone leaves the user
// guessing by how much.
export const AVATAR_WRONG_TYPE =
  "That file type isn't supported — PNG, JPG or WebP";
export const AVATAR_EMPTY = "That file is empty";
export const AVATAR_TOO_LARGE = (bytes: number) =>
  `Picture too large — ${formatBytes(bytes)}, limit is ${formatBytes(AVATAR_MAX_BYTES)}`;
export const AVATAR_TOO_BIG_DIMENSIONS = (width: number, height: number) =>
  `That picture is ${width}×${height} — ${AVATAR_MAX_DIMENSION}px a side is the limit`;

/** `null` means the file is acceptable. Dimensions are checked after decode. */
export function avatarRejectionReason(input: {
  type: string;
  size: number;
}): string | null {
  if (!isAvatarMimeType(input.type)) return AVATAR_WRONG_TYPE;
  if (input.size <= 0) return AVATAR_EMPTY;
  if (input.size > AVATAR_MAX_BYTES) return AVATAR_TOO_LARGE(input.size);
  return null;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run src/lib/validation/profile.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/profile.ts src/lib/validation/profile.test.ts
git commit -m "feat: add profile and avatar validation rules"
```

---

## Task 4: The avatar store

Turning bytes — from an upload or from a rendered SVG — into a stored 256×256 WebP, and writing the row.

**Files:**
- Create: `src/lib/avatar-store.ts`

**Interfaces:**
- Consumes: `avatarObjectKey`, `avatarUrl`, `contentHash` (Task 1); `renderAvatarSvg`, `AvatarStyleId` (Task 2); `AVATAR_MAX_DIMENSION`, `AVATAR_TOO_BIG_DIMENSIONS` (Task 3); `deleteObject`, `r2`, `env` (existing).
- Produces:
  - `class AvatarError extends Error` — message is safe to show the user
  - `storeAvatar(input: { userId: string; bytes: Uint8Array; style?: AvatarStyleId; seed?: string }): Promise<{ url: string }>`
  - `storeGeneratedAvatar(input: { userId: string; style: AvatarStyleId; seed: string }): Promise<{ url: string }>`
  - `clearAvatar(userId: string, nextImage: string | null): Promise<void>`

This task has no unit test: every branch is I/O against R2 and Prisma, and the codebase's convention (see `src/lib/r2.ts`, which has only `r2.test.ts` for its pure key builders) is to test the pure parts and exercise the I/O in the browser. Task 1 already covers the pure parts. It is verified end to end in Task 11.

- [ ] **Step 1: Write the implementation**

Create `src/lib/avatar-store.ts`:

```ts
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  type AvatarStyleId,
  renderAvatarSvg,
} from "@/lib/avatar-styles";
import { avatarObjectKey, avatarUrl, contentHash } from "@/lib/avatar";
import { prisma } from "@/lib/prisma";
import { deleteObject, r2 } from "@/lib/r2";
import {
  AVATAR_MAX_DIMENSION,
  AVATAR_TOO_BIG_DIMENSIONS,
  AVATAR_WRONG_TYPE,
} from "@/lib/validation/profile";
import { env } from "@/lib/env";

/** Its message is written for the user and is shown verbatim. */
export class AvatarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvatarError";
  }
}

const AVATAR_SIZE = 256;

/**
 * One size, no 2×: the largest render is the 96px profile preview, and 256
 * covers that on a 2× display.
 */
async function toWebp(bytes: Uint8Array): Promise<Uint8Array> {
  let image: sharp.Sharp;
  let meta: sharp.Metadata;
  try {
    image = sharp(Buffer.from(bytes));
    meta = await image.metadata();
  } catch {
    // A declared Content-Type only proves what the client claimed; this is
    // where we find out what actually arrived.
    throw new AvatarError(AVATAR_WRONG_TYPE);
  }

  const { width = 0, height = 0 } = meta;
  if (width > AVATAR_MAX_DIMENSION || height > AVATAR_MAX_DIMENSION) {
    throw new AvatarError(AVATAR_TOO_BIG_DIMENSIONS(width, height));
  }

  const out = await image
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();
  return new Uint8Array(out);
}

async function put(key: string, bytes: Uint8Array): Promise<void> {
  await r2.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: "image/webp",
    }),
  );
}

/**
 * Writes the row first, then deletes the object the row no longer points at.
 * A failed delete is logged rather than surfaced: an orphaned 256px WebP is
 * cheaper than a save the user is told failed when it did not.
 */
async function commit(input: {
  userId: string;
  key: string;
  url: string;
  style: AvatarStyleId | null;
  seed: string | null;
}): Promise<void> {
  const previous = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { avatarKey: true },
  });

  await prisma.user.update({
    where: { id: input.userId },
    data: {
      avatarKey: input.key,
      image: input.url,
      avatarStyle: input.style,
      avatarSeed: input.seed,
    },
  });

  if (previous?.avatarKey && previous.avatarKey !== input.key) {
    try {
      await deleteObject(previous.avatarKey);
    } catch (cause) {
      console.error("[avatar] could not delete the replaced object", cause);
    }
  }
}

/** An uploaded photo. `style`/`seed` are null, which is what marks it a photo. */
export async function storeAvatar(input: {
  userId: string;
  bytes: Uint8Array;
}): Promise<{ url: string }> {
  const webp = await toWebp(input.bytes);
  const hash = contentHash(webp);
  const key = avatarObjectKey(input.userId, hash);
  const url = avatarUrl(input.userId, hash);
  await put(key, webp);
  await commit({ userId: input.userId, key, url, style: null, seed: null });
  return { url };
}

/** A generated avatar. Same bytes, same key shape — only the row differs. */
export async function storeGeneratedAvatar(input: {
  userId: string;
  style: AvatarStyleId;
  seed: string;
}): Promise<{ url: string }> {
  const svg = renderAvatarSvg(input.style, input.seed, AVATAR_SIZE);
  const webp = await toWebp(new TextEncoder().encode(svg));
  const hash = contentHash(webp);
  const key = avatarObjectKey(input.userId, hash);
  const url = avatarUrl(input.userId, hash);
  await put(key, webp);
  await commit({
    userId: input.userId,
    key,
    url,
    style: input.style,
    seed: input.seed,
  });
  return { url };
}

/**
 * Drops the stored picture. `nextImage` is null for "Remove" (fall back to
 * initials) and a Google URL for "Use my Google photo".
 */
export async function clearAvatar(
  userId: string,
  nextImage: string | null,
): Promise<void> {
  const previous = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarKey: true },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      avatarKey: null,
      avatarStyle: null,
      avatarSeed: null,
      image: nextImage,
    },
  });

  if (previous?.avatarKey) {
    try {
      await deleteObject(previous.avatarKey);
    } catch (cause) {
      console.error("[avatar] could not delete the removed object", cause);
    }
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/avatar-store.ts
git commit -m "feat: store avatars as 256px webp in R2"
```

---

## Task 5: The route handlers

**Files:**
- Create: `src/app/api/avatars/[userId]/route.ts`
- Create: `src/app/api/avatars/route.ts`

**Interfaces:**
- Consumes: `storeAvatar`, `AvatarError` (Task 4); `avatarRejectionReason` (Task 3); `requireUser`, `UnauthorizedError`, `prisma`, `r2`, `env` (existing).
- Produces:
  - `GET /api/avatars/{userId}?v={hash}` → `image/webp`, or 404
  - `POST /api/avatars` with `FormData{ file }` → `{ url }` or `{ error }`
  - `type AvatarUploadResponse = { url: string }`

- [ ] **Step 1: Write the serve route**

Create `src/app/api/avatars/[userId]/route.ts`:

```ts
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { r2 } from "@/lib/r2";
import { env } from "@/lib/env";

/**
 * The portal has no anonymous surface, so avatars are not public either.
 *
 * `immutable` is safe only because the URL carries `?v={hash}` of the stored
 * bytes: a changed picture is a different URL, so nothing stale can be served.
 * `private` keeps shared caches out of it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    await requireUser();
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return new Response("Not signed in.", { status: 401 });
    }
    throw cause;
  }

  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarKey: true },
  });
  if (!user?.avatarKey) return new Response("Not found.", { status: 404 });

  let body: Uint8Array;
  try {
    const object = await r2.send(
      new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: user.avatarKey }),
    );
    if (!object.Body) return new Response("Not found.", { status: 404 });
    body = new Uint8Array(await object.Body.transformToByteArray());
  } catch {
    // A missing object is the initials fallback's cue, not a server fault.
    return new Response("Not found.", { status: 404 });
  }

  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
```

- [ ] **Step 2: Write the upload route**

Create `src/app/api/avatars/route.ts`:

```ts
import { NextResponse } from "next/server";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { AvatarError, storeAvatar } from "@/lib/avatar-store";
import { avatarRejectionReason } from "@/lib/validation/profile";

export type AvatarUploadResponse = { url: string };

/**
 * A route handler rather than a Server Action: Server Actions cap request
 * bodies at 1 MB by default, and a phone photo exceeds that before it is
 * resized. `context/coding-standard.md` prescribes a route for file uploads.
 *
 * Errors come back as a sentence the form shows verbatim, matching the upload
 * queue's plain-language style.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return NextResponse.json({ error: cause.message }, { status: 401 });
    }
    throw cause;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No picture was sent." }, { status: 400 });
  }

  const rejection = avatarRejectionReason({ type: file.type, size: file.size });
  if (rejection) {
    return NextResponse.json({ error: rejection }, { status: 400 });
  }

  try {
    const { url } = await storeAvatar({
      userId: user.id,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json({ url } satisfies AvatarUploadResponse);
  } catch (cause) {
    if (cause instanceof AvatarError) {
      return NextResponse.json({ error: cause.message }, { status: 400 });
    }
    console.error("[avatar] upload", cause);
    return NextResponse.json(
      { error: "We couldn't save that picture." },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Typecheck and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: both clean. The build is what proves the two new route segments compile under the App Router.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/avatars
git commit -m "feat: add avatar upload and serve routes"
```

---

## Task 6: Profile Server Actions

**Files:**
- Create: `src/actions/profile.ts`
- Test: `src/actions/profile.test.ts`

**Interfaces:**
- Consumes: `storeGeneratedAvatar`, `clearAvatar`, `AvatarError` (Task 4); `updateProfileSchema`, `generatedAvatarSchema` (Task 3); `requireUser`, `UnauthorizedError`, `prisma` (existing).
- Produces, each returning `ActionResult` from `@/actions/auth`:
  - `updateProfile(input: { name: string }): Promise<ActionResult>`
  - `setGeneratedAvatar(input: { style: string; seed: string }): Promise<ActionResult<{ url: string }>>`
  - `removeAvatar(): Promise<ActionResult>`
  - `useGooglePhoto(): Promise<ActionResult<{ url: string }>>`
  - `signOutEverywhere(): Promise<ActionResult>`

- [ ] **Step 1: Write the failing test**

Create `src/actions/profile.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const userUpdate = vi.fn();
const userFindUnique = vi.fn();
const accountFindFirst = vi.fn();
const storeGeneratedAvatar = vi.fn();
const clearAvatar = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: userUpdate, findUnique: userFindUnique },
    account: { findFirst: accountFindFirst },
  },
}));

class UnauthorizedError extends Error {}
const requireUser = vi.fn();
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError,
  requireUser: () => requireUser(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/avatar-store", () => ({
  AvatarError: class extends Error {},
  storeGeneratedAvatar: (...args: unknown[]) => storeGeneratedAvatar(...args),
  clearAvatar: (...args: unknown[]) => clearAvatar(...args),
}));

const {
  removeAvatar,
  setGeneratedAvatar,
  signOutEverywhere,
  updateProfile,
  useGooglePhoto,
} = await import("@/actions/profile");

const SESSION = { id: "u1", email: "aisha@test", name: "Aisha Rahman" };

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue(SESSION);
});

describe("updateProfile", () => {
  it("trims and saves a valid name", async () => {
    userUpdate.mockResolvedValue({});
    const result = await updateProfile({ name: "  Aisha Rahman  " });
    expect(result.success).toBe(true);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { name: "Aisha Rahman" },
    });
  });

  it("rejects an empty name without writing", async () => {
    const result = await updateProfile({ name: "   " });
    expect(result.success).toBe(false);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("returns a failure rather than throwing when signed out", async () => {
    requireUser.mockRejectedValue(new UnauthorizedError("You are not signed in."));
    const result = await updateProfile({ name: "Aisha Rahman" });
    expect(result.success).toBe(false);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});

describe("setGeneratedAvatar", () => {
  it("stores one of the five styles", async () => {
    storeGeneratedAvatar.mockResolvedValue({ url: "/api/avatars/u1?v=abc" });
    const result = await setGeneratedAvatar({ style: "clay", seed: "Aisha" });
    expect(result.success).toBe(true);
    expect(storeGeneratedAvatar).toHaveBeenCalledWith({
      userId: "u1",
      style: "clay",
      seed: "Aisha",
    });
  });

  it("rejects a style outside the five without storing", async () => {
    const result = await setGeneratedAvatar({ style: "lorelei", seed: "Aisha" });
    expect(result.success).toBe(false);
    expect(storeGeneratedAvatar).not.toHaveBeenCalled();
  });
});

describe("removeAvatar", () => {
  it("falls back to initials, never silently to the Google photo", async () => {
    clearAvatar.mockResolvedValue(undefined);
    const result = await removeAvatar();
    expect(result.success).toBe(true);
    expect(clearAvatar).toHaveBeenCalledWith("u1", null);
  });
});

describe("useGooglePhoto", () => {
  it("restores the picture from the linked Google account", async () => {
    accountFindFirst.mockResolvedValue({ id: "a1" });
    userFindUnique.mockResolvedValue({ image: null });
    clearAvatar.mockResolvedValue(undefined);
    const result = await useGooglePhoto();
    expect(result.success).toBe(true);
  });

  it("refuses when there is no linked Google account", async () => {
    accountFindFirst.mockResolvedValue(null);
    const result = await useGooglePhoto();
    expect(result.success).toBe(false);
    expect(clearAvatar).not.toHaveBeenCalled();
  });
});

describe("signOutEverywhere", () => {
  it("bumps sessionVersion by exactly one", async () => {
    userUpdate.mockResolvedValue({});
    const result = await signOutEverywhere();
    expect(result.success).toBe(true);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { sessionVersion: { increment: 1 } },
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/actions/profile.test.ts
```

Expected: FAIL — `Failed to resolve import "@/actions/profile"`.

- [ ] **Step 3: Write the implementation**

Create `src/actions/profile.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/actions/auth";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { AvatarError, clearAvatar, storeGeneratedAvatar } from "@/lib/avatar-store";
import { prisma } from "@/lib/prisma";
import {
  generatedAvatarSchema,
  updateProfileSchema,
} from "@/lib/validation/profile";

/** Everything a changed picture or name is visible on. */
function revalidateEverywhere(): void {
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function updateProfile(input: {
  name: string;
}): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That name will not do.",
    };
  }

  try {
    const session = await requireUser();
    await prisma.user.update({
      where: { id: session.id },
      data: { name: parsed.data.name },
    });
    revalidateEverywhere();
    return { success: true, data: undefined };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return { success: false, error: cause.message };
    }
    console.error("[profile] updateProfile", cause);
    return { success: false, error: "We could not save your name." };
  }
}

export async function setGeneratedAvatar(input: {
  style: string;
  seed: string;
}): Promise<ActionResult<{ url: string }>> {
  const parsed = generatedAvatarSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "That is not a style you can pick." };
  }

  try {
    const session = await requireUser();
    const { url } = await storeGeneratedAvatar({
      userId: session.id,
      style: parsed.data.style,
      seed: parsed.data.seed,
    });
    revalidateEverywhere();
    return { success: true, data: { url } };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return { success: false, error: cause.message };
    }
    if (cause instanceof AvatarError) {
      return { success: false, error: cause.message };
    }
    console.error("[profile] setGeneratedAvatar", cause);
    return { success: false, error: "We could not save that avatar." };
  }
}

/**
 * Falls back to initials, not to the Google photo. Otherwise "Remove" would
 * visibly remove nothing for a Google user; their photo is offered back as an
 * explicit choice instead.
 */
export async function removeAvatar(): Promise<ActionResult> {
  try {
    const session = await requireUser();
    await clearAvatar(session.id, null);
    revalidateEverywhere();
    return { success: true, data: undefined };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return { success: false, error: cause.message };
    }
    console.error("[profile] removeAvatar", cause);
    return { success: false, error: "We could not remove your picture." };
  }
}

export async function useGooglePhoto(): Promise<ActionResult<{ url: string }>> {
  try {
    const session = await requireUser();
    const account = await prisma.account.findFirst({
      where: { userId: session.id, provider: "google" },
      select: { id: true },
    });
    if (!account) {
      return {
        success: false,
        error: "Your account is not linked to Google.",
      };
    }

    // The picture Google gave us was written to `image` when the row was
    // created and has not been overwritten since; an upload only ever moves
    // `image` to an /api/avatars URL, so the original is gone once replaced.
    // Re-reading it needs a fresh sign-in, which is what we tell the user.
    const stored = await prisma.user.findUnique({
      where: { id: session.id },
      select: { image: true, avatarKey: true },
    });
    if (!stored?.avatarKey && stored?.image) {
      return { success: true, data: { url: stored.image } };
    }

    return {
      success: false,
      error: "Sign in with Google again to pick your Google photo back up.",
    };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return { success: false, error: cause.message };
    }
    console.error("[profile] useGooglePhoto", cause);
    return { success: false, error: "We could not fetch your Google photo." };
  }
}

/**
 * Unlike `changePassword`, this does **not** re-mint the current session: it
 * ends this one too, which is the point, and the caller redirects to /signin.
 */
export async function signOutEverywhere(): Promise<ActionResult> {
  try {
    const session = await requireUser();
    await prisma.user.update({
      where: { id: session.id },
      data: { sessionVersion: { increment: 1 } },
    });
    return { success: true, data: undefined };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return { success: false, error: cause.message };
    }
    console.error("[profile] signOutEverywhere", cause);
    return { success: false, error: "We could not sign you out everywhere." };
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run src/actions/profile.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/actions/profile.ts src/actions/profile.test.ts
git commit -m "feat: add profile server actions"
```

---

## Task 7: `PersonChip`, and retiring the copied helper

**Files:**
- Create: `src/components/ui/person.tsx`
- Modify: `src/components/portal/UserMenu.tsx`
- Modify: `src/components/admin/UsersTable.tsx:37` (drop local `initials`), `:78-100` (cell)
- Modify: `src/app/(admin)/layout.tsx:55-60`
- Modify: `src/components/purchase-orders/PoTable.tsx:53-78` (the local `Person`)
- Modify: `src/components/products/ProductThumb.tsx:5-12` (import `initials` instead)

**Interfaces:**
- Consumes: `initials` (Task 1).
- Produces: `PersonChip`, `PersonAvatar` from `@/components/ui/person`.

**Note:** `src/app/(auth)/signin/pending/page.tsx` also declares something named `initials`, but it is `email.slice(0, 2).toUpperCase()` — a monogram for an address with no `User` row behind it. **Leave it alone.** It is not a copy of the same function.

- [ ] **Step 1: Write the component**

Create `src/components/ui/person.tsx`:

```tsx
import { Cog } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/avatar";
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
 * "System" is not a person. An automated lifecycle event gets a neutral glyph
 * so it is never mistaken for a colleague's action.
 */
export const SYSTEM_ACTOR = "System";

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
```

- [ ] **Step 2: Retrofit `PoTable`**

In `src/components/purchase-orders/PoTable.tsx`, delete the local `Person` function (lines 53-78) and the now-unused `Avatar`/`AvatarFallback`/`AvatarImage` and `initials` imports, then add:

```tsx
import { PersonChip } from "@/components/ui/person";
```

Replace the two call sites — the `uploadedBy` and `confirmedBy` cells — with:

```tsx
// uploadedBy cell
cell: (row) =>
  row.uploadedByName ? (
    <PersonChip name={row.uploadedByName} image={row.uploadedByImage} />
  ) : (
    <span className="text-ink-disabled">Not confirmed</span>
  ),
```

```tsx
// confirmedBy cell — the empty state is the point: the backlog sorts to the top
cell: (row) =>
  row.confirmedByName ? (
    <PersonChip name={row.confirmedByName} image={row.confirmedByImage} />
  ) : (
    <span className="text-ink-disabled">Not confirmed</span>
  ),
```

- [ ] **Step 3: Retrofit `UserMenu`**

In `src/components/portal/UserMenu.tsx`, delete the local `initials` (lines 19-26) and the `Avatar`/`AvatarFallback`/`AvatarImage` imports; import `PersonAvatar` from `@/components/ui/person` and replace the `<Avatar className="size-8 shrink-0">…</Avatar>` block with:

```tsx
<PersonAvatar name={name} image={image} size="md" />
```

- [ ] **Step 4: Retrofit `UsersTable`**

In `src/components/admin/UsersTable.tsx`, delete the local `initials` (line 37) and the Avatar imports; import `PersonAvatar` and replace the `<Avatar className="size-7 shrink-0">…</Avatar>` block in the `name` cell with:

```tsx
<PersonAvatar name={row.name} image={row.image} size="md" />
```

The surrounding two-line name/email markup stays exactly as it is.

- [ ] **Step 5: Retrofit the admin layout**

In `src/app/(admin)/layout.tsx`, delete the local `initials` and the Avatar imports; import `PersonAvatar` and replace the `<Avatar className="size-8 shrink-0">…</Avatar>` block with:

```tsx
<PersonAvatar name={user.name} image={user.image} size="md" />
```

- [ ] **Step 6: Point `ProductThumb` at the shared helper**

In `src/components/products/ProductThumb.tsx`, delete the local `initials` (lines 5-12) and add:

```tsx
import { initials } from "@/lib/avatar";
```

The call site is unchanged — the algorithm is identical, it just runs over a product name.

- [ ] **Step 7: Prove the helper is defined once**

```bash
grep -rn "const initials" src/
```

Expected: exactly two hits — `src/lib/avatar.ts` is a `function`, so the only `const initials` left should be `src/app/(auth)/signin/pending/page.tsx` (the email monogram, deliberately untouched). If any other file still declares one, retrofit it.

```bash
npx tsc --noEmit && npm run lint
```

Expected: clean, with no unused-import warnings from the deleted blocks.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/person.tsx src/components/portal/UserMenu.tsx src/components/admin/UsersTable.tsx "src/app/(admin)/layout.tsx" src/components/purchase-orders/PoTable.tsx src/components/products/ProductThumb.tsx
git commit -m "refactor: one PersonChip for every place a person is named"
```

---

## Task 8: The sweep — avatars on PO detail

**Files:**
- Modify: `src/components/purchase-orders/ActivityList.tsx`
- Modify: `src/app/(portal)/purchase-orders/[id]/page.tsx:57` (confirmedBy select), `:64` (changedBy select), `:176-177` ("Moved here by"), `:234` ("Confirmed by"), `:200` and `:363` (event mapping)

**Interfaces:**
- Consumes: `PersonChip`, `PersonAvatar`, `SYSTEM_ACTOR` (Task 7).
- Produces: `ActivityEvent` gains `changedByImage: string | null`.

- [ ] **Step 1: Widen the two queries**

In `src/app/(portal)/purchase-orders/[id]/page.tsx`, change:

```ts
      confirmedBy: { select: { name: true } },
```

to:

```ts
      confirmedBy: { select: { name: true, image: true } },
```

and:

```ts
        include: { changedBy: { select: { name: true } } },
```

to:

```ts
        include: { changedBy: { select: { name: true, image: true } } },
```

- [ ] **Step 2: Carry the image through both event mappings**

At both `:200` and `:363`, beside the existing `changedByName`, add:

```ts
              changedByImage: event.changedBy?.image ?? null,
```

and at `:366`, beside `confirmedByName`, add:

```tsx
        confirmedByImage={po.confirmedBy?.image ?? null}
```

- [ ] **Step 3: Put avatars in the Activity card**

In `src/components/purchase-orders/ActivityList.tsx`, extend the type and props:

```ts
export type ActivityEvent = {
  id: string;
  kind: PoEventKind;
  fromStage: PoStage | null;
  toStage: PoStage;
  note: string | null;
  changedAt: string;
  changedByName: string | null;
  changedByImage: string | null;
};
```

```ts
export function ActivityList({
  events,
  confirmedAt,
  confirmedByName,
  confirmedByImage,
}: {
  events: ActivityEvent[];
  confirmedAt: string;
  confirmedByName: string | null;
  confirmedByImage: string | null;
}) {
```

Add the import:

```tsx
import { PersonAvatar, SYSTEM_ACTOR } from "@/components/ui/person";
```

Change each `<li>` to lay the avatar out beside the text rather than above it. The event `<li>` becomes:

```tsx
            <li
              key={event.id}
              className="flex items-start gap-sm border-b border-hairline pb-sm last:border-0 last:pb-0"
            >
              <PersonAvatar
                name={actor}
                image={event.changedByImage}
                size="sm"
                className="mt-xxs"
              />
              <span className="flex min-w-0 flex-col gap-xxs">
                <span className="text-[length:var(--text-body-sm)] text-ink">
                  {headline}
                  {!isEdit && event.note ? (
                    <span className="text-ink-secondary"> — “{event.note}”</span>
                  ) : null}
                </span>
                <span className="text-[length:var(--text-caption)] text-ink-tertiary">
                  {actor} · {formatDateTime(event.changedAt)}
                </span>
              </span>
            </li>
```

and the trailing Confirmed `<li>` becomes:

```tsx
        <li className="flex items-start gap-sm">
          <PersonAvatar
            name={confirmedByName ?? SYSTEM_ACTOR}
            image={confirmedByImage}
            size="sm"
            className="mt-xxs"
          />
          <span className="flex min-w-0 flex-col gap-xxs">
            <span className="text-[length:var(--text-body-sm)] text-ink">
              Confirmed
            </span>
            <span className="text-[length:var(--text-caption)] text-ink-tertiary">
              {confirmedByName ?? SYSTEM_ACTOR} · {formatDateTime(confirmedAt)}
            </span>
          </span>
        </li>
```

Note the `<p>` elements became `<span>` with `flex flex-col`: a `<p>` cannot be a flex child here without the browser's default margins fighting the `gap`, and block-level `<p>` inside an inline row is invalid nesting.

Also change the `actor` line so the fallback is the shared constant:

```ts
          const actor = event.changedByName ?? SYSTEM_ACTOR;
```

- [ ] **Step 4: Put an avatar on the two detail rows**

At `:176-177`, "Moved here by" becomes:

```tsx
              {latestStageEvent?.changedBy?.name ? (
                <span className="flex items-center gap-xs">
                  Moved here by
                  <PersonChip
                    name={latestStageEvent.changedBy.name}
                    image={latestStageEvent.changedBy.image}
                  />
                </span>
              ) : null}
```

At `:234`, the "Confirmed by" details row becomes a `PersonChip` rather than a bare string. The row list is a `[label, value]` tuple array, so change that entry to carry a node:

```tsx
                [
                  "Confirmed by",
                  po.confirmedBy?.name ? (
                    <PersonChip
                      name={po.confirmedBy.name}
                      image={po.confirmedBy.image}
                    />
                  ) : (
                    "—"
                  ),
                ],
```

If the tuple array is typed `[string, string][]`, widen it to `[string, ReactNode][]` and import `ReactNode` from `react`.

- [ ] **Step 5: Typecheck and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/purchase-orders/ActivityList.tsx "src/app/(portal)/purchase-orders/[id]/page.tsx"
git commit -m "feat: show who did what on purchase order detail"
```

---

## Task 9: `passwordChangedAt` at all four write sites

**Files:**
- Modify: `src/actions/auth.ts:122` (`resetPassword`), `:190` (`changePassword`)
- Modify: `src/actions/users.ts:91` (`createUser`), `:218` (`setPassword`)

**Interfaces:**
- Consumes: the `passwordChangedAt` column (Task 1).
- Produces: nothing new; Task 10's Security card reads the column.

`passwordChangedAt` means exactly one thing: **when `passwordHash` was last written**, by whoever wrote it. `deleteUser` (`src/actions/users.ts:276`) sets `passwordHash: null` — it clears a hash rather than setting one, so it is **not** touched.

- [ ] **Step 1: Write it in `resetPassword`**

In `src/actions/auth.ts`, in the update that sets `passwordHash` (around line 122), add the field beside it:

```ts
          passwordHash,
          passwordChangedAt: new Date(),
```

- [ ] **Step 2: Write it in `changePassword`**

Same file, around line 190:

```ts
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
```

- [ ] **Step 3: Write it in `createUser`**

In `src/actions/users.ts` around line 91, where `passwordHash` is conditionally set, set the timestamp only when a hash is actually written:

```ts
        passwordHash: data.password
          ? await hash(data.password, BCRYPT_COST)
          : null,
        passwordChangedAt: data.password ? new Date() : null,
```

Match the surrounding expression exactly — if the existing code computes the hash into a variable first, set `passwordChangedAt` from the same condition.

- [ ] **Step 4: Write it in `setPassword`**

Same file, around line 218:

```ts
          passwordHash: await hash(parsed.data.password, BCRYPT_COST),
          passwordChangedAt: new Date(),
```

- [ ] **Step 5: Confirm `deleteUser` is untouched**

```bash
grep -n "passwordChangedAt" src/actions/users.ts src/actions/auth.ts
```

Expected: three hits in `users.ts` (two of them the `createUser` pair) and two in `auth.ts` — and **none** inside `deleteUser`.

- [ ] **Step 6: Run the existing suites**

```bash
npx vitest run src/actions/users.test.ts src/lib/auth.signIn.test.ts
```

Expected: PASS. These assert on `userUpdate`/`userCreate` call shapes, so if a test asserts an exact `data` object it will now fail — update the expectation to include `passwordChangedAt: expect.any(Date)` rather than loosening the assertion.

- [ ] **Step 7: Commit**

```bash
git add src/actions/auth.ts src/actions/users.ts
git commit -m "feat: record when a password was last set"
```

---

## Task 10: The settings page

**Files:**
- Create: `src/app/(portal)/settings/page.tsx`
- Create: `src/app/(portal)/settings/loading.tsx`
- Create: `src/components/settings/ProfileCard.tsx`
- Create: `src/components/settings/AvatarPicker.tsx`
- Create: `src/components/settings/SecurityCard.tsx`
- Modify: `src/app/(auth)/account/password/page.tsx`
- Modify: `src/components/portal/UserMenu.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1-9.
- Produces: the `/settings` route and a Settings entry in the account menu.

- [ ] **Step 1: Write the picker**

Create `src/components/settings/AvatarPicker.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { removeAvatar, setGeneratedAvatar, useGooglePhoto } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/ui/person";
import {
  AVATAR_STYLES,
  AVATAR_STYLE_IDS,
  type AvatarStyleId,
} from "@/lib/avatar-styles";
import { AVATAR_ACCEPT_ATTRIBUTE } from "@/lib/validation/profile";
import { cn } from "@/lib/utils";

/** Six is enough to find one you like without becoming a contact sheet. */
const VARIANTS = 6;

export function AvatarPicker({
  name,
  image,
  currentStyle,
  currentSeed,
  hasGoogle,
  previews,
}: {
  name: string;
  image: string | null;
  currentStyle: AvatarStyleId | null;
  currentSeed: string | null;
  hasGoogle: boolean;
  /** style id → six data-URI SVGs, rendered on the server. */
  previews: Record<AvatarStyleId, string[]>;
}) {
  const { update } = useSession();
  const [style, setStyle] = useState<AvatarStyleId>(currentStyle ?? "clay");
  const [seeds, setSeeds] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);

  // The server rendered the previews from these same seeds, in this order.
  const seedList = seeds.length ? seeds : previews[style].map((_, i) => `${name}-${i}`);

  async function run(label: string, work: () => Promise<{ success: boolean; error?: string }>) {
    setPending(label);
    const result = await work();
    setPending(null);
    if (!result.success) {
      toast.error(result.error ?? "That did not work.");
      return;
    }
    // Repaints the sidebar immediately rather than waiting out the jwt
    // callback's five-minute refresh.
    await update();
  }

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center gap-md">
        <PersonAvatar name={name} image={image} size="lg" />
        <div className="flex flex-wrap gap-xs">
          <label
            className={cn(
              "inline-flex cursor-pointer items-center rounded-pill border border-hairline-strong px-md py-xs",
              "text-[length:var(--text-body-sm)] font-medium text-ink",
              "focus-within:outline-2 focus-within:outline-focus",
            )}
          >
            Upload a photo
            <input
              type="file"
              className="sr-only"
              accept={AVATAR_ACCEPT_ATTRIBUTE}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setPending("upload");
                const body = new FormData();
                body.append("file", file);
                const response = await fetch("/api/avatars", { method: "POST", body });
                const payload = (await response.json()) as { url?: string; error?: string };
                setPending(null);
                if (!response.ok) {
                  toast.error(payload.error ?? "We couldn't save that picture.");
                  return;
                }
                await update();
              }}
            />
          </label>
          {image ? (
            <Button
              variant="secondary"
              pending={pending === "remove"}
              onClick={() => run("remove", removeAvatar)}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Or choose a style
      </p>

      <div className="flex flex-wrap gap-xs">
        {AVATAR_STYLE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={style === id}
            onClick={() => setStyle(id)}
            className={cn(
              "rounded-pill border px-md py-xs text-[length:var(--text-body-sm)]",
              "focus-visible:outline-2 focus-visible:outline-focus",
              style === id
                ? "border-focus text-ink"
                : "border-hairline-strong text-ink-secondary",
            )}
          >
            {AVATAR_STYLES[id].label}
          </button>
        ))}
      </div>

      <fieldset className="flex flex-col gap-xs border-0 p-0">
        <legend className="sr-only">Choose a {style} variant</legend>
        <div className="flex flex-wrap gap-sm">
          {previews[style].slice(0, VARIANTS).map((dataUri, index) => {
            const seed = seedList[index];
            const selected = currentStyle === style && currentSeed === seed;
            return (
              <button
                key={seed}
                type="button"
                aria-pressed={selected}
                aria-label={`${AVATAR_STYLES[style].label} avatar, option ${index + 1}`}
                disabled={pending !== null}
                onClick={() =>
                  run("variant", () => setGeneratedAvatar({ style, seed }))
                }
                className={cn(
                  "size-16 overflow-hidden rounded-pill border bg-surface-soft",
                  "focus-visible:outline-2 focus-visible:outline-focus",
                  selected ? "border-focus" : "border-hairline",
                )}
              >
                {/* Decorative: the button's aria-label carries the meaning. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dataUri} alt="" className="size-full" />
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-sm">
        <Button
          variant="secondary"
          onClick={() =>
            setSeeds(
              Array.from({ length: VARIANTS }, () => crypto.randomUUID()),
            )
          }
        >
          Shuffle
        </Button>
        {hasGoogle ? (
          <Button
            variant="secondary"
            pending={pending === "google"}
            onClick={() => run("google", useGooglePhoto)}
          >
            Use my Google photo
          </Button>
        ) : null}
      </div>

      {/* croodles is CC BY 4.0; the other four are CC0. Drop this line only if
          croodles is dropped. */}
      <p className="text-[length:var(--text-caption)] text-ink-tertiary">
        Croodles by{" "}
        <a
          href={AVATAR_STYLES.croodles.attribution?.url}
          className="text-brand-link underline-offset-2 hover:underline"
        >
          vijay verma
        </a>{" "}
        · CC BY 4.0
      </p>
    </div>
  );
}
```

**Note on Shuffle:** re-seeding needs the server to re-render the previews. Wire `Shuffle` to push the seeds into the URL (`?seeds=a,b,c…`) through the project's `useUrlNavigation` hook so the Server Component re-renders them, rather than rendering DiceBear in the browser — that would ship all five style definitions to the client and defeat the tree-shaking in Task 2. Read `src/components/portal/useUrlNavigation.ts` (or wherever the hook lives — `grep -rn "useUrlNavigation" src/`) and follow its existing call style.

- [ ] **Step 2: Write the profile card**

Create `src/components/settings/ProfileCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { updateProfile } from "@/actions/profile";
import { AvatarPicker } from "@/components/settings/AvatarPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AvatarStyleId } from "@/lib/avatar-styles";
import { formatDate } from "@/lib/dates";

const LABEL =
  "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";

export function ProfileCard(props: {
  name: string;
  email: string;
  image: string | null;
  roleLabel: string;
  createdAt: string;
  currentStyle: AvatarStyleId | null;
  currentSeed: string | null;
  hasGoogle: boolean;
  previews: Record<AvatarStyleId, string[]>;
}) {
  const { update } = useSession();
  const [name, setName] = useState(props.name);
  const [pending, setPending] = useState(false);

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="mb-md text-[length:var(--text-heading-sm)] font-display text-ink">
        Profile
      </h2>

      <div className="flex flex-col gap-lg">
        <div className="flex flex-col gap-xs">
          <span className={LABEL}>Picture</span>
          <AvatarPicker
            name={props.name}
            image={props.image}
            currentStyle={props.currentStyle}
            currentSeed={props.currentSeed}
            hasGoogle={props.hasGoogle}
            previews={props.previews}
          />
        </div>

        <form
          className="flex flex-col gap-md"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            const result = await updateProfile({ name });
            setPending(false);
            if (!result.success) {
              toast.error(result.error);
              return;
            }
            await update();
            toast.success("Saved");
          }}
        >
          <label className="flex flex-col gap-xs">
            <span className={LABEL}>Display name</span>
            <Input
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <div className="flex flex-col gap-xs">
            <span className={LABEL}>Email</span>
            <p className="text-[length:var(--text-body-sm)] text-ink">
              {props.email}
            </p>
            <p className="text-[length:var(--text-caption)] text-ink-tertiary">
              Your email is how you sign in and how your admin finds you. Ask a
              super admin to change it.
            </p>
          </div>

          <div className="flex flex-wrap gap-xl">
            <div className="flex flex-col gap-xs">
              <span className={LABEL}>Role</span>
              <p className="text-[length:var(--text-body-sm)] text-ink">
                {props.roleLabel}
              </p>
            </div>
            <div className="flex flex-col gap-xs">
              <span className={LABEL}>Member since</span>
              <p className="text-[length:var(--text-body-sm)] text-ink">
                {formatDate(props.createdAt)}
              </p>
            </div>
          </div>

          <div>
            <Button type="submit" pending={pending}>
              Save
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Write the security card**

Create `src/components/settings/SecurityCard.tsx`. It renders:

- **Password row.** With a hash: "Last changed {formatDate(passwordChangedAt)}" or "Never changed" when null, and a `Button` opening a `Sheet` at `max-w-panel-sm` containing `<ChangePasswordForm forced={false} />`. Without a hash: the static line "Password managed by Google" in `text-ink-tertiary` carrying the same `title` the admin table uses — "This user signs in with Google; there is no password to reset."
- **Sessions row.** A `Button` "Sign out on all devices" opening a `Dialog`: title "Sign out on all devices?", body "This signs you out here as well. You'll need to sign in again.", confirm calling `signOutEverywhere()` then `signOut({ redirectTo: "/signin" })` from `next-auth/react`.

Use `max-w-panel-sm`, never `max-w-sm` — see Global Constraints. Follow the `Sheet`/`Dialog` usage in `src/components/admin/UserDrawer.tsx` for the house pattern.

- [ ] **Step 4: Write the page**

Create `src/app/(portal)/settings/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { getSessionUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { ProfileCard } from "@/components/settings/ProfileCard";
import { SecurityCard } from "@/components/settings/SecurityCard";
import {
  AVATAR_STYLE_IDS,
  type AvatarStyleId,
  isAvatarStyleId,
} from "@/lib/avatar-styles";
import { Avatar } from "@dicebear/core";
import { AVATAR_STYLES } from "@/lib/avatar-styles";

export const metadata: Metadata = {
  title: "Settings · Loving Hands Portal",
};

const VARIANTS = 6;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionUser();
  if (!session) redirect("/signin?next=/settings");

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      name: true,
      email: true,
      image: true,
      role: true,
      createdAt: true,
      avatarStyle: true,
      avatarSeed: true,
      passwordHash: true,
      passwordChangedAt: true,
      accounts: { where: { provider: "google" }, select: { id: true } },
    },
  });
  if (!user) redirect("/signin");

  // Seeds come from the URL so Shuffle is a server round trip; without them
  // the seed is the user's own name, so a first look is already personal.
  const params = await searchParams;
  const raw = typeof params.seeds === "string" ? params.seeds : "";
  const seeds = raw
    ? raw.split(",").filter(Boolean).slice(0, VARIANTS)
    : Array.from({ length: VARIANTS }, (_, i) => `${user.name}-${i}`);

  // Rendered here, never in the browser: shipping the definitions to the
  // client would defeat the tree-shaking that keeps 56 unused styles out.
  const previews = Object.fromEntries(
    AVATAR_STYLE_IDS.map((id) => [
      id,
      seeds.map((seed) =>
        new Avatar(AVATAR_STYLES[id].style, {
          seed,
          size: 96,
          ...AVATAR_STYLES[id].options,
        }).toDataUri(),
      ),
    ]),
  ) as Record<AvatarStyleId, string[]>;

  return (
    <div className="flex flex-col gap-lg">
      <h1 className="text-[length:var(--text-heading-md)] font-display text-ink">
        Settings
      </h1>

      <ProfileCard
        name={user.name}
        email={user.email}
        image={user.image}
        roleLabel={user.role === Role.SUPER_ADMIN ? "Super admin" : "Member"}
        createdAt={user.createdAt.toISOString()}
        currentStyle={
          user.avatarStyle && isAvatarStyleId(user.avatarStyle)
            ? user.avatarStyle
            : null
        }
        currentSeed={user.avatarSeed}
        hasGoogle={user.accounts.length > 0}
        previews={previews}
      />

      <SecurityCard
        hasPassword={Boolean(user.passwordHash)}
        passwordChangedAt={user.passwordChangedAt?.toISOString() ?? null}
      />
    </div>
  );
}
```

- [ ] **Step 5: Write the route skeleton**

Create `src/app/(portal)/settings/loading.tsx` using the shared `Skeletons` kit — `grep -rn "from \"@/components/portal/Skeletons\"" src/app` and copy the shape of an existing `loading.tsx`, e.g. `src/app/(portal)/products/loading.tsx`. Two card-shaped blocks under a heading block.

- [ ] **Step 6: Break the redirect loop at `/account/password`**

In `src/app/(auth)/account/password/page.tsx`, after the existing session check, add:

```tsx
  const forced = user.mustChangePassword;
  // A blanket redirect would ping-pong forever: the portal layout sends a
  // `mustChangePassword` user here, so only the un-forced case may leave.
  if (!forced) redirect("/settings#password");
```

The forced branch keeps the standalone `AuthCard` page exactly as it is — it must not need the portal shell.

- [ ] **Step 7: Add the account-menu entry**

In `src/components/portal/UserMenu.tsx`, inside `DropdownMenuContent`, above the existing Sign out item:

```tsx
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
```

Import `Link` from `next/link` and `DropdownMenuSeparator` from the dropdown module. `MobileTopBar` renders the same `UserMenu`, so both navs get this from one change. **Do not add a nav row** — `NAV` in `src/components/portal/nav.ts` is destinations only.

- [ ] **Step 8: Build**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expected: all clean.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(portal)/settings" src/components/settings "src/app/(auth)/account/password/page.tsx" src/components/portal/UserMenu.tsx
git commit -m "feat: add the account settings page"
```

---

## Task 11: Verification against the live database

No new code. This is where the I/O paths from Tasks 4, 5 and 10 — none of which have unit tests, because every branch is R2 or Prisma — are actually proven.

**Files:** none created or modified. Any change this task provokes is a fix committed on its own.

- [ ] **Step 1: Run the whole suite**

```bash
npx vitest run && npm run lint && npm run build
```

Expected: all pass. Record the test count; it should be the previous total plus roughly 42.

- [ ] **Step 2: Start the app**

```bash
npm run dev
```

Sign in as the seeded member. If the password is unknown or a forced change blocks you, read `docs/specs/SETUP-CHECKLIST.md` and the seed script rather than guessing.

- [ ] **Step 3: Work the acceptance criteria**

Check each and write down what you saw:

1. Upload a real photo. It appears in the profile card, **in the sidebar without a reload**, in the Activity card on a PO you confirmed, and in the PO table.
2. Pick each of the five styles. Six variants render, Shuffle changes them, the chosen one survives a reload and shows everywhere the photo did.
3. Remove it. Initials come back — **not** the Google photo.
4. Change the password from `/settings`. The session survives; the card now reads the new date.
5. "Sign out on all devices" lands on `/signin`, and the old cookie no longer works.
6. A `mustChangePassword` user still lands on the standalone `/account/password` and does not loop.
7. Confirm in devtools that **no request went to `api.dicebear.com`** — filter the network tab by "dicebear" across a full picker session.
8. Confirm `GET /api/avatars/{id}` returns `image/webp` with `Cache-Control: private, max-age=31536000, immutable`, and that signing out makes it 401.

- [ ] **Step 4: Check the three viewports**

`/settings` at 390, 768 and 1440px: no horizontal overflow, no clipped text, no standalone control under 44px on the phone width. The variant grid must wrap rather than scroll the page sideways.

- [ ] **Step 5: Remove every trace of the test data**

Delete the uploaded avatar objects from R2 and reset the rows you touched:

```bash
npx tsx --eval "
import { prisma } from './src/lib/prisma';
const u = await prisma.user.findMany({ where: { avatarKey: { not: null } }, select: { id: true, email: true, avatarKey: true } });
console.log(u);
"
```

Then null `avatarKey`, `avatarStyle`, `avatarSeed` and restore `image` for each account you changed, and delete the matching R2 objects. Confirm the database is back to 400 purchase orders and that no orphaned `avatars/` object remains.

- [ ] **Step 6: Write up what happened**

Update `context/current-feature.md`: move the Phase 10 block into History with what was verified, what was not, and anything found along the way. Follow the shape of the existing entries — they record the reasoning, not just the outcome.

- [ ] **Step 7: Commit**

```bash
git add context/current-feature.md
git commit -m "docs: record the settings and avatars verification"
```

---

## Self-Review

**Spec coverage** — each section of `docs/specs/10-settings-and-avatars.md` against a task:

| Spec § | Task |
|---|---|
| 1. Data model | 1 (columns, migration), 9 (`passwordChangedAt` writes) |
| 2. Upload route | 5 |
| 2. Serve route | 5 |
| 2. Remove | 6 (`removeAvatar`), 4 (`clearAvatar`) |
| 3. DiceBear — styles, licences, rendering, seeds | 2 (render), 10 (picker, attribution, Shuffle) |
| 4. `PersonChip` and the sweep | 7 (component + retrofit), 8 (PO detail) |
| 5. `/settings` — Profile, Security, redirect loop, entry points | 10 |
| 6. Actions and validation | 3 (validation), 6 (actions) |
| 7. Tests | 1, 2, 3, 6 (unit); 11 (browser) |
| 8. Acceptance criteria | 11 |
| 9. Out of scope | not implemented, by design |

No gaps.

**Placeholder scan** — one deliberate soft spot, flagged rather than hidden: Task 10 Step 3 (`SecurityCard`) and Step 5 (`loading.tsx`) describe their content and point at the exact file to copy the house pattern from, instead of pasting code. Both are assemblies of existing primitives (`Sheet`, `Dialog`, `ChangePasswordForm`, `Skeletons`) whose current API the implementer must read anyway; inventing markup here would more likely be wrong than useful. Every other step carries real code.

**Type consistency** — checked across tasks:

- `initials`, `avatarObjectKey`, `avatarUrl`, `contentHash` (Task 1) are used with these exact names in Tasks 4 and 7.
- `AvatarStyleId`, `AVATAR_STYLES`, `AVATAR_STYLE_IDS`, `isAvatarStyleId`, `renderAvatarSvg` (Task 2) are used unchanged in Tasks 3, 4, 6 and 10.
- `storeAvatar`, `storeGeneratedAvatar`, `clearAvatar`, `AvatarError` (Task 4) match their call sites in Tasks 5 and 6.
- `PersonChip` / `PersonAvatar` / `SYSTEM_ACTOR` (Task 7) match every use in Task 8.
- `ActivityEvent.changedByImage` (Task 8) is added in the same task that supplies it.
- `ActionResult` is imported from `@/actions/auth`, where it is already exported.

**Known risks the implementer should not be surprised by:**

1. **`useGooglePhoto` is the weakest piece.** Once an upload overwrites `image`, the original Google URL is gone — nothing stores it separately. Task 6's implementation therefore returns an honest error telling the user to sign in with Google again, rather than pretending. If that reads badly in practice, the fix is a `googleImage` column, which is a spec change, not a silent edit.
2. **`PrismaAdapter` and `image` on account linking is unverified.** `resolveGoogleSignIn` only writes `image` on create, but the adapter itself was not read. Confirm during Task 11 by linking a Google account to a user who has an uploaded avatar and checking the avatar survives.
3. **`croodles` and `notionists` are faint at 24px** in the PO table — measured, and accepted by the user on 2026-09-07. Not a defect to fix.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-07-settings-and-avatars.md`.

# Organisation Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A super admin edits the supplier contact details the public shop displays — name, email, phone, address — from `/admin`, with no Vercel access and no redeploy.

**Architecture:** One row in a new `OrgSettings` table (`id = "singleton"`, enforced by a CHECK), read through one cached resolver that falls back **per field** to the existing `ZEN_GARDEN_*` environment variables. A card on `/admin` writes it. The only existing component that changes is `ShopFooter`, which reads `env` directly today and takes props after this.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 (`@theme` tokens only), Prisma 7 on Neon, Zod 4, Vitest.

**Spec:** `docs/specs/24-org-settings.md` — read it alongside this plan. Section references (§1, §2…) point at it.

## Global Constraints

- **Super admin only.** The `(admin)` shell enforces it; the action enforces it again — a route guard is not an authorisation model.
- **The fallback is per field, never per row.** Resolving per row means saving only the email blanks a phone that still lives in an env var. This is the one decision a reasonable implementation gets wrong.
- **`""` is never stored.** Every field trims to null, so clearing a field returns it to the env fallback rather than storing an empty string that shadows it forever.
- **Tailwind v4 CSS config only.** Never create `tailwind.config.ts`. All colour, type, radius and spacing from the `@theme` tokens in `src/app/globals.css`. No raw hex, no px font size, no arbitrary value like `text-[15px]`. `text-[length:var(--text-body-sm)]` is the established idiom and is correct.
- Sentence-case labels. Primary CTA is the dark `bg-ink` pill (the `Button` default variant), never purple. 44px minimum touch target below `sm`.
- TypeScript strict, no `any`. Every Server Action returns `{ success, data, error }` and never throws to the caller.
- `revalidatePath` in storefront-affecting code names the **real** paths (`/shop`, `/shop/products`), never the browser-relative ones — `src/lib/shop-routes.ts` has `shopPath` for exactly this.
- Migrations: hand-written file plus `timeout 120 npx prisma migrate deploy`. **Never** `migrate dev` (it has hung on this machine and prompts in a way a non-TTY cannot answer). Never `migrate reset` or any destructive database command. Never edit `.env.local`.
- Tests: `npm test` (`vitest run`); one file with `npx vitest run <path>`.
- Conventional commit messages ending with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Never write "Generated with Claude".

---

### Task 1: Shared validation helpers, schema, migration

**Files:**
- Create: `src/lib/validation/common.ts`
- Modify: `src/lib/validation/clients.ts` (import the two helpers instead of defining them)
- Create: `src/lib/validation/org-settings.ts`
- Create: `src/lib/validation/org-settings.test.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260911140000_org_settings/migration.sql`

**Interfaces:**
- Produces: `optionalText(max)`, `optionalEmail` from `src/lib/validation/common.ts`; `supplierPatchSchema`, `SupplierPatch` from `src/lib/validation/org-settings.ts`; the `OrgSettings` model. Tasks 2 and 3 consume these.

- [ ] **Step 1: Lift the two helpers into a shared module**

`src/lib/validation/clients.ts` currently defines `optionalText` and `optionalEmail` as module-private constants (Phase 23). Move them verbatim — including their doc comments, which explain a real zod-4 typing wall — into a new `src/lib/validation/common.ts` and export them:

```ts
import { z } from "zod";
import { emailSchema } from "@/lib/validation/auth";

/** `""` and whitespace become null, so a cleared field clears the column. */
export const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((value) => value?.trim() || null)
    .pipe(z.string().max(max).nullable());

/**
 * Optional, but a real address when it is there — a company inbox or a
 * supplier contact may be blank, and `emailSchema` alone rejects `""`, but a
 * typo in one must still be caught.
 *
 * Written as a `transform` rather than `.pipe(z.union([z.null(), emailSchema]))`:
 * `emailSchema` is itself a `z.preprocess`, whose declared input type is
 * `unknown`, and zod 4's `.pipe()` requires the piped-into schema's input type
 * to be assignable to the narrower `string | null` that `optionalText`
 * produces — `unknown` fails that check under strict mode even though every
 * value it could ever receive is fine at runtime.
 */
export const optionalEmail = optionalText(200).transform((value, ctx) => {
  if (value === null) return null;
  const parsed = emailSchema.safeParse(value);
  if (!parsed.success) {
    ctx.addIssue(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
    return z.NEVER;
  }
  return parsed.data;
});
```

Then in `src/lib/validation/clients.ts`, delete both definitions and add:

```ts
import { optionalEmail, optionalText } from "@/lib/validation/common";
```

Copying rather than moving them would mean a company email and a supplier email validating differently the first time one is edited.

- [ ] **Step 2: Confirm nothing regressed**

Run: `npx vitest run src/lib/validation/clients.test.ts src/actions/customers.test.ts`
Expected: PASS, unchanged. If anything fails, the move was not verbatim — fix it before continuing.

- [ ] **Step 3: Write the failing schema tests**

Create `src/lib/validation/org-settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { supplierPatchSchema } from "@/lib/validation/org-settings";

const blank = {
  supplierName: null,
  supplierEmail: null,
  supplierPhone: null,
  supplierAddress: null,
};

describe("supplierPatchSchema", () => {
  it("accepts an entirely empty patch — clearing every field is legitimate", () => {
    expect(supplierPatchSchema.parse(blank)).toEqual(blank);
  });

  it("turns blank strings into null, so a cleared field falls back to env", () => {
    const parsed = supplierPatchSchema.parse({
      supplierName: "   ",
      supplierEmail: "",
      supplierPhone: "  ",
      supplierAddress: "\n",
    });
    expect(parsed).toEqual(blank);
  });

  it("trims and lower-cases the email", () => {
    const parsed = supplierPatchSchema.parse({ ...blank, supplierEmail: " Hi@Example.COM " });
    expect(parsed.supplierEmail).toBe("hi@example.com");
  });

  it("refuses a malformed email", () => {
    expect(supplierPatchSchema.safeParse({ ...blank, supplierEmail: "nope" }).success).toBe(false);
  });

  it("keeps an address's line breaks — the footer renders them", () => {
    const address = "12 Jalan Satu\nTaman Dua\n47100 Puchong";
    expect(supplierPatchSchema.parse({ ...blank, supplierAddress: address }).supplierAddress).toBe(
      address,
    );
  });

  it.each([
    ["supplierName", 121],
    ["supplierPhone", 33],
    ["supplierAddress", 301],
  ])("refuses an over-long %s", (field, length) => {
    const result = supplierPatchSchema.safeParse({ ...blank, [field]: "a".repeat(length) });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/lib/validation/org-settings.test.ts`
Expected: FAIL — `Cannot find module '@/lib/validation/org-settings'`.

- [ ] **Step 5: Write the schema**

Create `src/lib/validation/org-settings.ts`:

```ts
import { z } from "zod";
import { optionalEmail, optionalText } from "@/lib/validation/common";

/**
 * The supplier contact details the public shop displays. Every field is
 * optional: a null means "fall back to the environment variable", which is
 * why the action trims `""` to null rather than storing it (§2).
 */
export const supplierPatchSchema = z.object({
  supplierName: optionalText(120),
  supplierEmail: optionalEmail,
  /** Unparsed: Malaysian numbers are written a dozen ways. */
  supplierPhone: optionalText(32),
  supplierAddress: optionalText(300),
});

export type SupplierPatch = z.input<typeof supplierPatchSchema>;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/validation/org-settings.test.ts`
Expected: PASS, all cases.

- [ ] **Step 7: Add the model to the Prisma schema**

In `prisma/schema.prisma`, add the model (place it after `AccessRequest`, near the other org-level tables):

```prisma
/// Exactly one row, id "singleton" — a CHECK constraint enforces it. Org-wide
/// settings a super admin owns, read through src/lib/org-settings.ts with a
/// per-field fallback to the ZEN_GARDEN_* environment variables.
model OrgSettings {
  id              String   @id @default("singleton")
  supplierName    String?
  supplierEmail   String?
  supplierPhone   String?
  supplierAddress String?
  updatedAt       DateTime @updatedAt
  updatedById     String?
  updatedBy       User?    @relation("orgSettingsUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
}
```

And on `model User`, beside the other back-relations:

```prisma
  orgSettingsUpdates OrgSettings[]        @relation("orgSettingsUpdatedBy")
```

- [ ] **Step 8: Write the migration by hand**

Create `prisma/migrations/20260911140000_org_settings/migration.sql`:

```sql
-- Organisation settings (docs/specs/24-org-settings.md §1).

CREATE TABLE "OrgSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "supplierName" TEXT,
    "supplierEmail" TEXT,
    "supplierPhone" TEXT,
    "supplierAddress" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "OrgSettings_pkey" PRIMARY KEY ("id")
);

-- The singleton is enforced in SQL, not by convention: a second row appearing
-- and the app silently reading whichever came back first is exactly the failure
-- a comment does not prevent.
ALTER TABLE "OrgSettings" ADD CONSTRAINT "OrgSettings_singleton" CHECK ("id" = 'singleton');

-- SetNull, never Cascade: the organisation's configuration must survive
-- whoever last touched it.
ALTER TABLE "OrgSettings" ADD CONSTRAINT "OrgSettings_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 9: Apply the migration and regenerate**

```bash
timeout 120 npx prisma migrate deploy
timeout 120 npx prisma generate
timeout 120 npx prisma migrate status
```

Expected: `20260911140000_org_settings` applied; `migrate status` reports up to date. If it reports drift, **stop and report BLOCKED** with the exact output — do not reset the database.

- [ ] **Step 10: Prove the CHECK refuses a second row**

Write a throwaway script under `scripts/` (delete it afterwards) that inserts `id = "singleton"` successfully, then attempts `id = "other"` and catches the error. Run it with `npx tsx --env-file=.env.local`. Report both outcomes, then delete both the script **and** the `singleton` row it created (Task 2's tests and Task 3's browser check assume an empty table).

Expected: the first insert succeeds; the second fails with a check-constraint violation naming `OrgSettings_singleton`.

- [ ] **Step 11: Full suite, typecheck, lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all clean. Unlike Phase 23's Task 1, nothing is expected to be red here — the helper move is behaviour-preserving.

- [ ] **Step 12: Commit**

```bash
git add src/lib/validation/common.ts src/lib/validation/clients.ts \
        src/lib/validation/org-settings.ts src/lib/validation/org-settings.test.ts \
        prisma/schema.prisma prisma/migrations/20260911140000_org_settings
git commit -m "feat(db): a settings row a super admin owns"
```

---

### Task 2: The resolver and the action

**Files:**
- Create: `src/lib/org-settings.ts`
- Create: `src/lib/org-settings.test.ts`
- Create: `src/actions/org-settings.ts`
- Create: `src/actions/org-settings.test.ts`

**Interfaces:**
- Consumes: `supplierPatchSchema`, `SupplierPatch`, the `OrgSettings` model.
- Produces:
  - `loadSupplierDetails(): Promise<SupplierDetails>` and `loadSupplierSettings(): Promise<SupplierSettings>` from `src/lib/org-settings.ts`
  - `SupplierDetails = { name: string | null; email: string | null; phone: string | null; address: string | null }`
  - `SupplierSettings = { stored: SupplierDetails; fallback: SupplierDetails; updatedAt: Date | null; updatedByName: string | null }`
  - `updateSupplierDetails(patch: SupplierPatch): Promise<ActionResult>` from `src/actions/org-settings.ts`
  - Task 3 imports all three.

- [ ] **Step 1: Write the failing resolver tests**

Create `src/lib/org-settings.test.ts`. The point of this file is the per-field fallback — test all four combinations per field, not one combination per field:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { orgSettings: { findUnique } },
}));
vi.mock("@/lib/env", () => ({
  env: {
    ZEN_GARDEN_NAME: "Env Name",
    ZEN_GARDEN_EMAIL: "env@example.com",
    ZEN_GARDEN_PHONE: "+60 3-0000 0000",
    ZEN_GARDEN_ADDRESS: "Env address",
  },
}));

const { loadSupplierDetails, loadSupplierSettings } = await import("@/lib/org-settings");

beforeEach(() => {
  vi.resetAllMocks();
});

const row = (over: Record<string, unknown> = {}) => ({
  supplierName: null,
  supplierEmail: null,
  supplierPhone: null,
  supplierAddress: null,
  updatedAt: new Date("2026-09-11T00:00:00Z"),
  updatedBy: null,
  ...over,
});

describe("loadSupplierDetails resolves per field, not per row", () => {
  it("falls back to env for every field when there is no row at all", async () => {
    findUnique.mockResolvedValue(null);
    expect(await loadSupplierDetails()).toEqual({
      name: "Env Name",
      email: "env@example.com",
      phone: "+60 3-0000 0000",
      address: "Env address",
    });
  });

  it("takes a stored field and still falls back for the others", async () => {
    // The defect this whole test file exists for: resolving per row would
    // blank the phone that is still living in an env var.
    findUnique.mockResolvedValue(row({ supplierEmail: "stored@example.com" }));
    const details = await loadSupplierDetails();
    expect(details.email).toBe("stored@example.com");
    expect(details.phone).toBe("+60 3-0000 0000");
    expect(details.name).toBe("Env Name");
    expect(details.address).toBe("Env address");
  });

  it("prefers every stored field when all are set", async () => {
    findUnique.mockResolvedValue(
      row({
        supplierName: "Kim Brothers",
        supplierEmail: "no-reply@kim-brothers.com",
        supplierPhone: "+60 12-345 6789",
        supplierAddress: "12 Jalan Satu\nPuchong",
      }),
    );
    expect(await loadSupplierDetails()).toEqual({
      name: "Kim Brothers",
      email: "no-reply@kim-brothers.com",
      phone: "+60 12-345 6789",
      address: "12 Jalan Satu\nPuchong",
    });
  });

  it("reads the singleton by primary key", async () => {
    findUnique.mockResolvedValue(null);
    await loadSupplierDetails();
    expect(findUnique.mock.calls[0][0].where).toEqual({ id: "singleton" });
  });
});

describe("loadSupplierSettings", () => {
  it("reports stored and fallback separately, so the card can show both", async () => {
    findUnique.mockResolvedValue(row({ supplierEmail: "stored@example.com" }));
    const settings = await loadSupplierSettings();
    expect(settings.stored.email).toBe("stored@example.com");
    expect(settings.stored.phone).toBeNull();
    expect(settings.fallback.phone).toBe("+60 3-0000 0000");
  });

  it("names who saved it", async () => {
    findUnique.mockResolvedValue(row({ updatedBy: { name: "Aisha Rahman" } }));
    const settings = await loadSupplierSettings();
    expect(settings.updatedByName).toBe("Aisha Rahman");
    expect(settings.updatedAt).toEqual(new Date("2026-09-11T00:00:00Z"));
  });

  it("has no updatedAt before the first save", async () => {
    findUnique.mockResolvedValue(null);
    const settings = await loadSupplierSettings();
    expect(settings.updatedAt).toBeNull();
    expect(settings.updatedByName).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/org-settings.test.ts`
Expected: FAIL — `Cannot find module '@/lib/org-settings'`.

- [ ] **Step 3: Write the resolver**

Create `src/lib/org-settings.ts`:

```ts
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export type SupplierDetails = {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export type SupplierSettings = {
  /** What is in the database. Null means "fall back". */
  stored: SupplierDetails;
  /** What the environment would supply. For the admin card's placeholders. */
  fallback: SupplierDetails;
  updatedAt: Date | null;
  updatedByName: string | null;
};

const SINGLETON = { id: "singleton" };

const SELECT = {
  supplierName: true,
  supplierEmail: true,
  supplierPhone: true,
  supplierAddress: true,
  updatedAt: true,
  updatedBy: { select: { name: true } },
} as const;

const fromEnv = (): SupplierDetails => ({
  name: env.ZEN_GARDEN_NAME ?? null,
  email: env.ZEN_GARDEN_EMAIL ?? null,
  phone: env.ZEN_GARDEN_PHONE ?? null,
  address: env.ZEN_GARDEN_ADDRESS ?? null,
});

/**
 * Deliberately not wrapped in React's `cache()`: each request has exactly one
 * call site. The shop layout resolves once and passes the result to the header
 * and the footer as props, and the admin page calls `loadSupplierSettings`
 * once. Memoising would buy nothing and would force every unit test to stub
 * React.
 */
const readRow = () =>
  prisma.orgSettings.findUnique({ where: SINGLETON, select: SELECT });

/**
 * The supplier details to display. **Resolved per field, never per row**: a
 * per-row rule ("is there a settings row? then use it") would blank a phone
 * that is still living in an env var the moment someone saved only the email
 * (docs/specs/24-org-settings.md §2).
 */
export async function loadSupplierDetails(): Promise<SupplierDetails> {
  const row = await readRow();
  const env = fromEnv();
  return {
    name: row?.supplierName ?? env.name,
    email: row?.supplierEmail ?? env.email,
    phone: row?.supplierPhone ?? env.phone,
    address: row?.supplierAddress ?? env.address,
  };
}

/** Stored and fallback kept apart, so the card can show one as the other's placeholder. */
export async function loadSupplierSettings(): Promise<SupplierSettings> {
  const row = await readRow();
  return {
    stored: {
      name: row?.supplierName ?? null,
      email: row?.supplierEmail ?? null,
      phone: row?.supplierPhone ?? null,
      address: row?.supplierAddress ?? null,
    },
    fallback: fromEnv(),
    updatedAt: row?.updatedAt ?? null,
    updatedByName: row?.updatedBy?.name ?? null,
  };
}
```

Note the local `const env = fromEnv()` shadows the imported `env` inside that one function — rename the local to `fallback` if the linter objects.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/lib/org-settings.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Write the failing action tests**

Create `src/actions/org-settings.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const requireSuperAdmin = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: { orgSettings: { upsert } } }));
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireSuperAdmin,
}));
vi.mock("next/cache", () => ({ revalidatePath }));

const { updateSupplierDetails } = await import("@/actions/org-settings");

const patch = {
  supplierName: "Kim Brothers",
  supplierEmail: "no-reply@kim-brothers.com",
  supplierPhone: "+60 12-345 6789",
  supplierAddress: "12 Jalan Satu\nPuchong",
};

beforeEach(() => {
  vi.resetAllMocks();
  requireSuperAdmin.mockResolvedValue({ id: "admin-1", role: "SUPER_ADMIN" });
  upsert.mockResolvedValue({});
});

describe("updateSupplierDetails", () => {
  it("refuses a member", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireSuperAdmin.mockRejectedValue(new UnauthorizedError("Super admin only."));
    expect(await updateSupplierDetails(patch)).toEqual({
      success: false,
      error: "Super admin only.",
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts the singleton and records who saved it", async () => {
    await updateSupplierDetails(patch);
    const args = upsert.mock.calls[0][0];
    expect(args.where).toEqual({ id: "singleton" });
    expect(args.create.id).toBe("singleton");
    expect(args.create.updatedById).toBe("admin-1");
    expect(args.update.updatedById).toBe("admin-1");
    expect(args.update.supplierEmail).toBe("no-reply@kim-brothers.com");
  });

  it("stores null rather than an empty string, so a cleared field falls back to env", async () => {
    await updateSupplierDetails({ ...patch, supplierPhone: "   " });
    expect(upsert.mock.calls[0][0].update.supplierPhone).toBeNull();
  });

  it("refuses a malformed email and writes nothing", async () => {
    const result = await updateSupplierDetails({ ...patch, supplierEmail: "nope" });
    expect(result.success).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("revalidates the storefront's real paths, not the browser-relative ones", async () => {
    await updateSupplierDetails(patch);
    const paths = revalidatePath.mock.calls.map((call) => call[0]);
    // `/shop/...`, because revalidation keys on the resolved route rather than
    // the URL the browser asked for (src/lib/shop-routes.ts).
    expect(paths).toContain("/shop");
    expect(paths.every((path: string) => path.startsWith("/shop") || path === "/admin")).toBe(true);
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run src/actions/org-settings.test.ts`
Expected: FAIL — `Cannot find module '@/actions/org-settings'`.

- [ ] **Step 7: Write the action**

Create `src/actions/org-settings.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { UnauthorizedError, requireSuperAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { shopPath } from "@/lib/shop-routes";
import { supplierPatchSchema, type SupplierPatch } from "@/lib/validation/org-settings";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * The supplier contact details the public shop displays. Super admin only —
 * the `(admin)` shell already refuses everyone else, and this refuses them
 * again, because a route guard is not an authorisation model.
 */
export async function updateSupplierDetails(
  patch: SupplierPatch,
): Promise<ActionResult> {
  let user;
  try {
    user = await requireSuperAdmin();
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return { success: false, error: cause.message };
    throw cause;
  }

  const parsed = supplierPatchSchema.safeParse(patch);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Those changes could not be saved.",
    };
  }

  try {
    await prisma.orgSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...parsed.data, updatedById: user.id },
      update: { ...parsed.data, updatedById: user.id },
    });

    revalidatePath("/admin");
    // The real paths, not the browser-relative ones: revalidation keys on the
    // resolved route (src/lib/shop-routes.ts).
    revalidatePath(shopPath.home());
    revalidatePath(shopPath.catalogue());
    revalidatePath(shopPath.cart());
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[org-settings] updateSupplierDetails", cause);
    return { success: false, error: "We couldn't save those details." };
  }
}
```

- [ ] **Step 8: Run them to verify they pass**

Run: `npx vitest run src/actions/org-settings.test.ts`
Expected: PASS, all cases.

- [ ] **Step 9: Full suite, typecheck, lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all clean.

- [ ] **Step 10: Commit**

```bash
git add src/lib/org-settings.ts src/lib/org-settings.test.ts \
        src/actions/org-settings.ts src/actions/org-settings.test.ts
git commit -m "feat(settings): resolve supplier details from the database, falling back per field"
```

---

### Task 3: The admin card and the shop read sites

**Files:**
- Create: `src/components/admin/ContactDetailsCard.tsx`
- Modify: `src/app/(admin)/admin/page.tsx`
- Modify: `src/app/(storefront)/shop/layout.tsx:71`
- Modify: `src/components/shop/ShopFooter.tsx`

**Interfaces:**
- Consumes: `loadSupplierDetails`, `loadSupplierSettings`, `SupplierDetails`, `updateSupplierDetails`, `SupplierPatch`.
- Produces: nothing other tasks import.

- [ ] **Step 1: Build the card**

Create `src/components/admin/ContactDetailsCard.tsx` (client). Follow the idiom in `src/components/buyers/BuyerContactsCard.tsx`: local state, a `Button pending`, `toast` on both outcomes, `useAwaitableRefresh` after a successful save.

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateSupplierDetails } from "@/actions/org-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import type { SupplierSettings } from "@/lib/org-settings";
import { formatDate } from "@/lib/dates";

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

/** What an empty field shows, so the reader can see what the shop displays today. */
const placeholderFor = (fallback: string | null) =>
  fallback ? `Currently ${fallback} — from the environment` : "Not set";

/**
 * The supplier contact details the public shop displays. Super admin only.
 *
 * An empty field shows its environment value as placeholder text rather than
 * nothing: the fallback is invisible otherwise, and a reader would have to open
 * Vercel to learn what the footer is currently showing.
 */
export function ContactDetailsCard({ settings }: { settings: SupplierSettings }) {
  const refresh = useAwaitableRefresh();
  const [form, setForm] = useState({
    supplierName: settings.stored.name ?? "",
    supplierEmail: settings.stored.email ?? "",
    supplierPhone: settings.stored.phone ?? "",
    supplierAddress: settings.stored.address ?? "",
  });
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setSaving(true);
    try {
      const result = await updateSupplierDetails(form);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Contact details saved.");
      await refresh();
    } catch {
      // An unguarded await here is what left the avatar picker permanently
      // disabled on 2026-09-08.
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-xl rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="font-display text-[length:var(--text-heading-sm)] font-[650] text-ink">
        Contact details
      </h2>
      <p className={`mt-xxs ${caption}`}>These appear on your public shop.</p>

      <form
        className="mt-md flex max-w-panel-lg flex-col gap-md"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-xxs">
          <label htmlFor="supplier-name" className={label}>
            Supplier name
          </label>
          <Input
            id="supplier-name"
            placeholder={placeholderFor(settings.fallback.name)}
            value={form.supplierName}
            onChange={(event) => set("supplierName", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="supplier-email" className={label}>
            Email
          </label>
          <Input
            id="supplier-email"
            type="email"
            placeholder={placeholderFor(settings.fallback.email)}
            value={form.supplierEmail}
            onChange={(event) => set("supplierEmail", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="supplier-phone" className={label}>
            Phone
          </label>
          <Input
            id="supplier-phone"
            placeholder={placeholderFor(settings.fallback.phone)}
            value={form.supplierPhone}
            onChange={(event) => set("supplierPhone", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="supplier-address" className={label}>
            Address
          </label>
          <Textarea
            id="supplier-address"
            rows={3}
            placeholder={placeholderFor(settings.fallback.address)}
            value={form.supplierAddress}
            onChange={(event) => set("supplierAddress", event.target.value)}
          />
          <p className={caption}>Line breaks are kept, and the footer shows them.</p>
        </div>

        <div className="flex flex-wrap items-center gap-md">
          <Button type="submit" pending={saving}>
            Save
          </Button>
          {settings.updatedAt ? (
            <p className={caption}>
              Last changed
              {settings.updatedByName ? ` by ${settings.updatedByName}` : ""} on{" "}
              {formatDate(settings.updatedAt)}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
```

`formatDate(value: DateInput)` in `src/lib/dates.ts` accepts a `Date`, so `settings.updatedAt` goes straight in.

- [ ] **Step 2: Mount it on `/admin`**

In `src/app/(admin)/admin/page.tsx`, add `loadSupplierSettings()` to the existing `Promise.all` and render the card after `<UsersTable …/>`:

```tsx
const [users, requests, settings] = await Promise.all([
  listUsers(),
  listPendingRequests(),
  loadSupplierSettings(),
]);
```

```tsx
      <ContactDetailsCard settings={settings} />
```

**Leave the page's `h1` ("Users") and eyebrow ("Access") alone.** The card taking its own `h2` below the table is a deliberate, recorded deviation (`docs/specs/24-org-settings.md` §4) — retitling a screen nobody asked me to change is worse, and when a third kind of setting arrives `/admin/settings` earns its own page.

- [ ] **Step 3: Make the shop read the resolver**

In `src/app/(storefront)/shop/layout.tsx`, add `loadSupplierDetails()` to the existing `Promise.all` and pass the result to both children:

```tsx
const [categories, summary, supplier] = await Promise.all([
  listShopCategories(),
  viewer.kind === "client" ? cartSummary(viewer.id) : Promise.resolve(null),
  loadSupplierDetails(),
]);
```

Then `supplierEmail={supplier.email}` on `<ShopHeader>` (replacing `env.ZEN_GARDEN_EMAIL ?? null`), and `supplier={supplier}` on `<ShopFooter>`.

In `src/components/shop/ShopFooter.tsx`: take `supplier: SupplierDetails` as a prop, drop the `env` import, and replace each `env.ZEN_GARDEN_*` read with the matching field. **Update its doc comment** — it currently says it reads `env` directly "unlike `ShopAccountMenu`", and that distinction no longer exists.

Render the address with `whitespace-pre-line` so the stored line breaks show.

- [ ] **Step 4: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean. If `env.ZEN_GARDEN_*` is now unused anywhere, lint will say so — keep the keys in `env.ts` (they are the fallback) but remove dead imports.

- [ ] **Step 5: Verify in the browser — this is the gate**

You need a super admin. `aisha@lovinghandsportal.com` / `Password123!` is a `MEMBER` in development; promote her to `SUPER_ADMIN` with `scripts/grant-super-admin.ts` and **record it in your report so the last task can revert it**. Run `npm run dev`, and use the Playwright MCP browser.

Local `.env.local` has `ZEN_GARDEN_*` blank or partly set — check which before you start, and say so in your report, because the fallback behaviour depends on it. If all four are blank, set **one** of them (`ZEN_GARDEN_PHONE`) via a **shell export** in the terminal running `npm run dev` — never by editing `.env.local`, which holds the only working Neon and R2 credentials and is git-ignored.

1. `/admin` as a super admin → the **Contact details** card is present below the users table, with the caption and four empty fields. An empty field whose env var is set shows "Currently … — from the environment"; one with no fallback shows "Not set".
2. Type a supplier email and Save → toast; reload; the value persists in the field.
3. **The whole point:** open the shop host and confirm the footer's email row and the account menu's *Talk to our team* link both show the new value — **with no redeploy and no server restart**. Read the `mailto:` href, not just the visible text.
4. Save an address with two line breaks → the footer renders three lines, not one.
5. **The per-field fallback, measured:** with `ZEN_GARDEN_PHONE` exported and the phone field left empty, confirm the shop footer still shows the env phone **while** showing the stored email. This is acceptance criterion 2 and the defect the design exists to prevent.
6. Clear the email field and Save → the footer falls back to the env email (or the row disappears if there is no fallback).
7. Enter `nope` as the email → refused with a message, the typed values kept, and `prisma.orgSettings.findUnique` shows the old value unchanged.
8. As a MEMBER (create a throwaway one; delete it afterwards), `/admin` is refused — confirm what actually happens (redirect or 404) and report it.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/ContactDetailsCard.tsx "src/app/(admin)/admin/page.tsx" \
        "src/app/(storefront)/shop/layout.tsx" src/components/shop/ShopFooter.tsx
git commit -m "feat(settings): a super admin edits the shop's contact details"
```

---

### Task 4: Verification, cleanup, documentation

**Files:**
- Modify: `.env.example`
- Modify: `docs/specs/SETUP-CHECKLIST.md`
- Modify: `context/current-feature.md`

- [ ] **Step 1: Document the new home for these values**

In `.env.example`, extend the four `ZEN_GARDEN_*` comments to say they are fallbacks — for example:

```
ZEN_GARDEN_EMAIL=                          # fallback only; set it in /admin instead (Phase 24)
```

In `docs/specs/SETUP-CHECKLIST.md`, find where the `ZEN_GARDEN_*` keys are described (near §6/§7) and add a line: these four can be left blank and set from **Contact details** on `/admin` after the first deploy, which needs no redeploy. Do not delete the existing guidance — the env vars still work and are what a preview deployment uses.

- [ ] **Step 2: Full verification**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean. Record the test count.

Sweep `/admin` and the shop home at 390, 768 and 1440 — six combinations — asserting `document.documentElement.scrollWidth === window.innerWidth`. At 390, list every interactive element under 44px in the new card and report it; the card's inputs and the Save button must clear the floor.

- [ ] **Step 3: Remove the test data**

- Delete the `OrgSettings` row if the browser checks left one, **or** keep it only if it holds values you actually want — say which, and why, in your report.
- Revert `aisha@lovinghandsportal.com` to `MEMBER`, and read the row back to confirm.
- Delete any throwaway MEMBER created for Step 5.8.
- Report `user.count()` and `orgSettings.count()` before and after.
- Confirm `git status` is clean and `.env.local` is unmodified.

**Nothing on production.**

- [ ] **Step 4: History entry**

Add an entry to `context/current-feature.md` in the house style — long, specific, reporting what was **measured** rather than assumed, naming what was **not** verified. It must cover:

- The singleton CHECK and that it was seen to refuse a second row.
- **The per-field fallback and why it is per field**: resolving per row would blank a phone still living in an env var the moment someone saved only the email. Report the browser measurement from Task 3 Step 5.5 that proves it.
- That a change reaches the public shop with no redeploy — the thing the phase exists for.
- That `ShopFooter` stopped reading `env` directly and now takes props, so the layout is the one place these resolve.
- The recorded deviation: the card sits under `/admin`'s "Users" heading, and `/admin/settings` earns its own page when a third setting arrives.
- **Not verified:** anything on production. Say what else you did not exercise.

Update the Status block at the top to name Phase 24.

- [ ] **Step 5: Commit and stop**

```bash
git add .env.example docs/specs/SETUP-CHECKLIST.md context/current-feature.md
git commit -m "docs: record Phase 24 as built and verified"
```

**Do not merge and do not delete the branch.** Report the test count, the row counts before and after, the sweep result, and anything that did not work.

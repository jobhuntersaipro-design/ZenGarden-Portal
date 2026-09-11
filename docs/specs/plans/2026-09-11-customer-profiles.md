# Customer Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ops can create a customer from scratch — company details, a point of contact, an internal remark and a shop login — in one screen, and that customer can change their password more than once.

**Architecture:** A customer is a `Buyer` (the company) plus zero or more `CLIENT` `User` rows (its people) — the shape Phase 15 already built. This adds three nullable columns, one new Server Action that writes both rows in a transaction and emails afterwards, one new page, and one menu row on the shop. No new table, no new role, no change to how anyone authenticates.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 (`@theme` tokens only), Prisma 7 on Neon Postgres, Zod 4, Resend, bcryptjs, Vitest.

**Spec:** `docs/specs/23-customer-profiles.md` — read it alongside this plan. Section references below (§1, §4…) point at it.

## Global Constraints

- **`username` is a label, never a credential.** Nothing in the sign-in path may look it up. Task 1 Step 9 pins this with a test.
- **`Buyer.remark` must never reach the shop.** Enforced by narrow `select`s asserted by equality (Task 6), not by remembering.
- **Creating a customer is super admin only.** Members keep editing a buyer's contact details and remark; members still cannot rename a buyer.
- **Tailwind v4 CSS config only.** Never create `tailwind.config.ts`. All colour, type, radius and spacing from the `@theme` tokens in `src/app/globals.css`. No raw hex, no px font size, no arbitrary value like `text-[15px]`. If a token is missing, add it to `@theme` first.
- **Sentence-case labels.** Primary CTA is the dark `bg-ink` pill at `rounded-pill` (the `Button` default variant), never purple.
- **44px minimum touch target below `sm`** for any standalone control.
- Every Server Action returns `{ success, data, error }` and reports failure by toast.
- No `any`. Interfaces for all props and action inputs. Functions under 50 lines where possible.
- Migrations via a hand-written file plus `prisma migrate deploy` under a `timeout` — `migrate dev` has hung on this machine (2026-09-09) and prompts in a way a non-TTY cannot answer.
- Tests run with `npm test` (`vitest run`). A single file: `npx vitest run <path>`.
- Do not commit until the step says to. Never put "Generated with Claude" in a commit message.

---

### Task 1: Schema, migration and validation

**Files:**
- Modify: `prisma/schema.prisma` (`Buyer`, `User`)
- Create: `prisma/migrations/20260911090000_customer_profiles/migration.sql`
- Modify: `src/lib/validation/clients.ts`
- Create: `src/lib/validation/clients.test.ts`
- Modify: `src/lib/validation/auth.test.ts`

**Interfaces:**
- Consumes: `emailSchema` from `src/lib/validation/auth.ts`.
- Produces: `usernameSchema`, `phoneSchema`, `inviteContactSchema` (now with `username`, `phone`), `contactPatchSchema`, `ContactPatch`, `createCustomerSchema`, `CreateCustomerInput` — all from `src/lib/validation/clients.ts`. Tasks 2, 3 and 4 import these by exactly these names.

- [ ] **Step 1: Write the failing validation tests**

Create `src/lib/validation/clients.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createCustomerSchema,
  contactPatchSchema,
  inviteContactSchema,
  phoneSchema,
  usernameSchema,
} from "@/lib/validation/clients";

describe("usernameSchema", () => {
  it("lower-cases and trims, so the unique index is enough on its own", () => {
    expect(usernameSchema.parse("  Acme.Ops  ")).toBe("acme.ops");
  });

  it.each(["acme.ops", "a_1", "zen-garden", "a".repeat(32)])("accepts %s", (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ["ab", "too short"],
    [".acme", "leading dot"],
    ["acme ops", "a space"],
    ["acme@ops", "an at sign"],
    ["a".repeat(33), "too long"],
  ])("rejects %s (%s)", (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(false);
  });
});

describe("phoneSchema", () => {
  it("turns blank into null, so clearing the field clears the column", () => {
    expect(phoneSchema.parse("   ")).toBeNull();
    expect(phoneSchema.parse(undefined)).toBeNull();
  });

  it("keeps a number as written — we do not parse Malaysian formats", () => {
    expect(phoneSchema.parse(" +60 12-345 6789 ")).toBe("+60 12-345 6789");
  });
});

describe("inviteContactSchema", () => {
  const base = {
    buyerId: "b1",
    name: "Siti",
    email: "Siti@Buyer.com",
    username: "siti",
    phone: null,
  };

  it("normalises the email as well as the username", () => {
    const parsed = inviteContactSchema.parse(base);
    expect(parsed.email).toBe("siti@buyer.com");
    expect(parsed.username).toBe("siti");
  });

  it("requires a username — a contact without one is not creatable", () => {
    const { username, ...rest } = base;
    expect(inviteContactSchema.safeParse(rest).success).toBe(false);
  });
});

describe("contactPatchSchema", () => {
  it("cannot change the email: that is how we identify the account", () => {
    const parsed = contactPatchSchema.parse({
      name: "Siti",
      username: "siti",
      phone: null,
    });
    expect(Object.keys(parsed).sort()).toEqual(["name", "phone", "username"]);
  });
});

describe("createCustomerSchema", () => {
  const company = {
    name: "Acme Industrial Sdn Bhd",
    address: null,
    paymentTerms: null,
    remark: null,
    contactName: null,
    email: null,
    phone: null,
  };

  it("accepts a company with no shop login at all", () => {
    const parsed = createCustomerSchema.parse({ company });
    expect(parsed.contact).toBeUndefined();
    expect(parsed.sendInvite).toBe(true);
  });

  it("lets the company email be blank but not malformed", () => {
    expect(createCustomerSchema.safeParse({ company: { ...company, email: "" } }).success).toBe(true);
    expect(createCustomerSchema.safeParse({ company: { ...company, email: "nope" } }).success).toBe(false);
  });

  it("rejects a contact missing a username", () => {
    const result = createCustomerSchema.safeParse({
      company,
      contact: { name: "Siti", email: "siti@buyer.com", phone: null },
    });
    expect(result.success).toBe(false);
  });

  it("requires a company name", () => {
    expect(createCustomerSchema.safeParse({ company: { ...company, name: "" } }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/validation/clients.test.ts`
Expected: FAIL — `usernameSchema`, `phoneSchema`, `contactPatchSchema` and `createCustomerSchema` are not exported.

- [ ] **Step 3: Write the schemas**

Replace the whole body of `src/lib/validation/clients.ts`:

```ts
import { z } from "zod";
import { emailSchema } from "@/lib/validation/auth";

/** `""` and whitespace become null, so a cleared field clears the column. */
const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((value) => value?.trim() || null)
    .pipe(z.string().max(max).nullable());

/**
 * Optional, but a real address when it is there. `Buyer.email` is a company
 * inbox rather than a login, so it may be blank — `emailSchema` alone rejects
 * `""` — but a typo in it must still be caught.
 */
const optionalEmail = optionalText(200).pipe(z.union([z.null(), emailSchema]));

/**
 * A display handle. Lower-cased and trimmed before validation, exactly as
 * `emailSchema` is: normalising on the way in is what makes a plain unique
 * index sufficient, and without it `Acme` and `acme` are two rows.
 *
 * NEVER an authentication identifier — `signInSchema` takes an email and
 * nothing else, and `src/lib/validation/auth.test.ts` asserts that it stays
 * that way.
 */
export const usernameSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9._-]{2,31}$/,
      "Use 3–32 characters: letters, numbers, dots, dashes or underscores, starting with a letter or number.",
    ),
);

/** Free text: Malaysian numbers are written a dozen ways and we do not parse them. */
export const phoneSchema = optionalText(32);

/**
 * A buyer's own contact. There is no role field: the actions always write
 * CLIENT, and the buyer comes from the page the invite was sent from, so
 * neither can be chosen by the caller.
 */
export const inviteContactSchema = z.object({
  buyerId: z.string().min(1),
  name: z.string().min(1, "A name is required").max(120),
  email: emailSchema,
  username: usernameSchema,
  phone: phoneSchema,
});

export type InviteContactInput = z.input<typeof inviteContactSchema>;

/** Name, username and phone. Not the email: that is how we identify the account. */
export const contactPatchSchema = inviteContactSchema.pick({
  name: true,
  username: true,
  phone: true,
});

export type ContactPatch = z.input<typeof contactPatchSchema>;

export const createCustomerSchema = z.object({
  company: z.object({
    name: z.string().min(1, "A customer needs a name").max(200),
    address: optionalText(500),
    paymentTerms: optionalText(120),
    remark: optionalText(2000),
    contactName: optionalText(120),
    email: optionalEmail,
    phone: phoneSchema,
  }),
  /** Omitted when the reader did not open "Give them a shop login". */
  contact: inviteContactSchema.omit({ buyerId: true }).optional(),
  sendInvite: z.boolean().default(true),
});

export type CreateCustomerInput = z.input<typeof createCustomerSchema>;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/validation/clients.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Add the columns to the Prisma schema**

In `prisma/schema.prisma`, inside `model User`, after `phone` does not exist yet — add both fields next to `buyerId`:

```prisma
  /// A display handle, shown in ops and (from Phase 21) on the customer's own
  /// settings screen. NEVER an authentication identifier — see
  /// docs/specs/23-customer-profiles.md §2.
  username           String?              @unique
  /// The contact's own line. The company's address stays on `Buyer`.
  phone              String?
```

Inside `model Buyer`, after `paymentTerms`:

```prisma
  /// Internal note about this customer. Ops only — no shop query may select it.
  remark         String?
```

- [ ] **Step 6: Write the migration by hand**

Create `prisma/migrations/20260911090000_customer_profiles/migration.sql`:

```sql
-- Customer profiles (docs/specs/23-customer-profiles.md §1).
-- One file, unlike Phase 15's pair: no enum value is added here, so nothing is
-- referenced in the transaction that created it.

ALTER TABLE "Buyer" ADD COLUMN "remark" TEXT;

ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;

-- Nullable and unique: Postgres allows any number of NULLs under a unique
-- index, so every existing ops user keeps a null and no backfill is needed.
-- `username` is stored lower-cased by usernameSchema, which is what makes a
-- plain (not case-insensitive) index sufficient.
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
```

- [ ] **Step 7: Apply the migration and regenerate**

```bash
timeout 120 npx prisma migrate deploy
timeout 120 npx prisma generate
timeout 120 npx prisma migrate status
```

Expected: `migrate deploy` applies `20260911090000_customer_profiles`; `migrate status` reports the schema up to date. If `migrate deploy` reports drift, stop and report it — do not reset the database.

- [ ] **Step 8: Verify the columns exist and the index is unique**

```bash
npx tsx -e "
import { prisma } from './src/lib/prisma';
const cols = await prisma.\$queryRawUnsafe(\`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE (table_name = 'User' AND column_name IN ('username','phone'))
     OR (table_name = 'Buyer' AND column_name = 'remark') ORDER BY 1,2\`);
const idx = await prisma.\$queryRawUnsafe(\`
  SELECT indexname FROM pg_indexes WHERE tablename = 'User' AND indexname = 'User_username_key'\`);
console.log(cols, idx);
await prisma.\$disconnect();
"
```

Expected: three column rows (`Buyer.remark`, `User.phone`, `User.username`) and one index row.

- [ ] **Step 9: Pin that `username` is not a credential**

Append to `src/lib/validation/auth.test.ts`:

```ts
describe("signInSchema is email + password and stays that way", () => {
  // An absence test, deliberately. `User.username` reads like a login field to
  // whoever meets it next (docs/specs/23-customer-profiles.md §2), and this is
  // the cheapest way to say it is not one.
  it("does not accept a username in place of an email", () => {
    expect(signInSchema.safeParse({ username: "siti", password: "x" }).success).toBe(false);
  });

  it("parses to exactly email and password", () => {
    const parsed = signInSchema.parse({ email: "a@b.com", password: "x" });
    expect(Object.keys(parsed).sort()).toEqual(["email", "password"]);
  });
});
```

If `signInSchema` and `describe` are not already imported in that file, add them to the existing import lines rather than adding new ones.

- [ ] **Step 10: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. `clients.test.ts` and `auth.test.ts` green; no type errors.

Note: `src/actions/clients.ts` does not yet pass `username`/`phone`, but `inviteContactSchema` now requires `username`, so `src/actions/clients.test.ts` will fail here. That is expected and Task 2 fixes it — if it is the only failure, continue.

- [ ] **Step 11: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260911090000_customer_profiles \
        src/generated/prisma src/lib/validation/clients.ts \
        src/lib/validation/clients.test.ts src/lib/validation/auth.test.ts
git commit -m "feat(db): a remark on a customer, a username and phone on their contacts"
```

---

### Task 2: `createCustomer` and the contact actions

**Files:**
- Create: `src/lib/client-invites.ts`
- Create: `src/actions/customers.ts`
- Create: `src/actions/customers.test.ts`
- Modify: `src/actions/clients.ts`
- Modify: `src/actions/clients.test.ts`
- Modify: `src/lib/queries/clients.ts`
- Modify: `src/lib/queries/buyer-detail.ts:15-24` (the `BuyerDetail["buyer"]` type) and `:60-71` (the `select`)
- Modify: `src/actions/buyers.ts` (`buyerPatchSchema` gains `remark`)

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces:
  - `src/lib/client-invites.ts` — `temporaryPassword(): string`, `clientSignInUrl(): string`, `hashPassword(plain: string): Promise<string>`, `uniqueMessage(target: unknown): string`, `sendInviteEmail(contact: { name: string; email: string }, password: string): Promise<boolean>`
  - `src/actions/customers.ts` — `createCustomer(input: CreateCustomerInput): Promise<ActionResult<{ buyerId: string; invite: "sent" | "failed" | "skipped" }>>`
  - `src/actions/clients.ts` — `updateBuyerContact(contactId: string, patch: ContactPatch): Promise<ActionResult>`; `inviteBuyerContact` unchanged in signature, now writing `username` and `phone`
  - `src/lib/queries/clients.ts` — `BuyerContact` gains `username: string | null` and `phone: string | null`
  - Task 3 imports `createCustomer`; Task 4 imports `updateBuyerContact` and reads the widened `BuyerContact`.

- [ ] **Step 1: Write the failing `createCustomer` tests**

Create `src/actions/customers.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const buyerCreate = vi.fn();
const userCreate = vi.fn();
const sendEmail = vi.fn();
const requireSuperAdmin = vi.fn();

// The action runs both writes in one transaction, so the mock hands the
// callback a `tx` carrying the same two spies the assertions read.
const transaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({ buyer: { create: buyerCreate }, user: { create: userCreate } }),
);

vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: transaction } }));
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireSuperAdmin,
}));
vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://www.example.com", SHOP_URL: "https://shop.example.com" },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const templateArgs: { signInUrl: string; password: string; name: string }[] = [];
vi.mock("@/emails/TemporaryPassword", () => ({
  TemporaryPassword: (props: { signInUrl: string; password: string; name: string }) => {
    templateArgs.push(props);
    return null;
  },
  temporaryPasswordSubject: () => "Your temporary password",
}));

const { createCustomer } = await import("@/actions/customers");

const company = {
  name: "Acme Industrial Sdn Bhd",
  address: "12 Jalan Satu",
  paymentTerms: "30 days",
  remark: "Pays late. Chase on day 25.",
  contactName: "Raj",
  email: "accounts@acme.com",
  phone: "+60 3-1234 5678",
};
const contact = {
  name: "Siti",
  email: "siti@acme.com",
  username: "siti",
  phone: "+60 12-345 6789",
};

beforeEach(() => {
  vi.resetAllMocks();
  templateArgs.length = 0;
  requireSuperAdmin.mockResolvedValue({ id: "admin", role: "SUPER_ADMIN" });
  transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ buyer: { create: buyerCreate }, user: { create: userCreate } }),
  );
  buyerCreate.mockResolvedValue({ id: "buyer-1" });
  userCreate.mockResolvedValue({ id: "c1", name: "Siti", email: "siti@acme.com" });
  sendEmail.mockResolvedValue({ sent: true });
});

describe("createCustomer", () => {
  it("refuses a member", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireSuperAdmin.mockRejectedValue(new UnauthorizedError("Super admin only."));
    const result = await createCustomer({ company });
    expect(result).toEqual({ success: false, error: "Super admin only." });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("creates the company alone when no login was asked for", async () => {
    const result = await createCustomer({ company });
    expect(result).toEqual({ success: true, data: { buyerId: "buyer-1", invite: "skipped" } });
    expect(userCreate).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(buyerCreate.mock.calls[0][0].data.remark).toBe("Pays late. Chase on day 25.");
  });

  it("creates the contact as a CLIENT of that buyer, with the handle", async () => {
    await createCustomer({ company, contact });
    const data = userCreate.mock.calls[0][0].data;
    expect(data.role).toBe("CLIENT");
    expect(data.buyerId).toBe("buyer-1");
    expect(data.username).toBe("siti");
    expect(data.phone).toBe("+60 12-345 6789");
    expect(data.mustChangePassword).toBe(true);
    expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(data).not.toHaveProperty("password");
  });

  it("emails the shop sign-in URL, and the password it actually hashed", async () => {
    const { compare } = await import("bcryptjs");
    await createCustomer({ company, contact });
    expect(templateArgs.at(-1)?.signInUrl).toBe("https://shop.example.com/signin");
    const sent = templateArgs.at(-1)!.password;
    expect(await compare(sent, userCreate.mock.calls[0][0].data.passwordHash)).toBe(true);
  });

  it("sends nothing when the invitation box was unchecked", async () => {
    const result = await createCustomer({ company, contact, sendInvite: false });
    expect(result).toEqual({ success: true, data: { buyerId: "buyer-1", invite: "skipped" } });
    expect(userCreate).toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("keeps the customer when the email fails — a Resend outage must not lose typing", async () => {
    sendEmail.mockRejectedValue(new Error("resend is down"));
    const result = await createCustomer({ company, contact });
    expect(result).toEqual({ success: true, data: { buyerId: "buyer-1", invite: "failed" } });
    expect(buyerCreate).toHaveBeenCalled();
    expect(userCreate).toHaveBeenCalled();
  });

  it("sends the email only after the transaction has committed", async () => {
    const order: string[] = [];
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const value = await fn({ buyer: { create: buyerCreate }, user: { create: userCreate } });
      order.push("commit");
      return value;
    });
    sendEmail.mockImplementation(async () => {
      order.push("email");
      return { sent: true };
    });
    await createCustomer({ company, contact });
    expect(order).toEqual(["commit", "email"]);
  });

  it.each([
    [["username"], "That username is taken."],
    [["email"], "That email address is already in use."],
    [["name"], "Another customer already has that name."],
  ])("names the field behind a P2002 on %s", async (target, message) => {
    transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "7",
        meta: { target },
      }),
    );
    expect(await createCustomer({ company, contact })).toEqual({ success: false, error: message });
  });

  it("reads a constraint name too, and username wins over the 'name' it contains", async () => {
    transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "7",
        meta: { target: "User_username_key" },
      }),
    );
    const result = await createCustomer({ company, contact });
    expect(result).toEqual({ success: false, error: "That username is taken." });
  });

  it("rejects a bad input before touching the database", async () => {
    const result = await createCustomer({ company: { ...company, name: "" } });
    expect(result.success).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/actions/customers.test.ts`
Expected: FAIL — `Cannot find module '@/actions/customers'`.

- [ ] **Step 3: Write the shared invite helpers**

Create `src/lib/client-invites.ts`:

```ts
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { TemporaryPassword, temporaryPasswordSubject } from "@/emails/TemporaryPassword";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

const BCRYPT_COST = 12;

/**
 * A temporary password the reader never chooses. 18 base64url characters is
 * well past the 10-character floor `passwordSchema` sets, and it is shown once
 * in the email and never stored in the clear.
 */
export const temporaryPassword = () => randomBytes(14).toString("base64url");

export const hashPassword = (plain: string) => hash(plain, BCRYPT_COST);

/**
 * Where a client signs in. Falls back to the portal only so a deployment with
 * no shop host configured still sends a working link — on such a deployment
 * the proxy serves everything from one host anyway.
 */
export const clientSignInUrl = () => `${env.SHOP_URL ?? env.APP_URL}/signin`;

/**
 * Returns whether it went out rather than throwing. The customer is already
 * committed by the time this runs (docs/specs/23-customer-profiles.md §4), and
 * a Resend outage must not read as a failed creation.
 */
export async function sendInviteEmail(
  contact: { name: string; email: string },
  password: string,
): Promise<boolean> {
  try {
    await sendEmail({
      to: contact.email,
      subject: temporaryPasswordSubject(),
      react: TemporaryPassword({
        name: contact.name,
        password,
        // The shop, never the portal: a client sent to the portal is
        // redirected straight back out of it.
        signInUrl: clientSignInUrl(),
      }),
    });
    return true;
  } catch (cause) {
    console.error("[client-invites] sendInviteEmail", cause);
    return false;
  }
}

/**
 * Which unique constraint a P2002 hit. Prisma reports `meta.target` as either
 * the field names or the constraint name depending on the connector, so this
 * matches on the text of both.
 *
 * **The order is load-bearing.** "username" contains "name", and
 * `User_username_key` contains both "name" and "username" — checking `name`
 * first would label every duplicate handle a duplicate company.
 */
export function uniqueMessage(target: unknown): string {
  const text = (Array.isArray(target) ? target.join(",") : String(target ?? "")).toLowerCase();
  if (text.includes("username")) return "That username is taken.";
  if (text.includes("email")) return "That email address is already in use.";
  if (text.includes("name")) return "Another customer already has that name.";
  return "Something about that customer is already in use.";
}
```

- [ ] **Step 4: Write `createCustomer`**

Create `src/actions/customers.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { UnauthorizedError, requireSuperAdmin } from "@/lib/auth-guards";
import {
  hashPassword,
  sendInviteEmail,
  temporaryPassword,
  uniqueMessage,
} from "@/lib/client-invites";
import { prisma } from "@/lib/prisma";
import { createCustomerSchema, type CreateCustomerInput } from "@/lib/validation/clients";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

export type CreatedCustomer = {
  buyerId: string;
  /** "skipped" is a login handed over another way, or no login at all. */
  invite: "sent" | "failed" | "skipped";
};

/**
 * The front door a customer never had: before this, a `Buyer` existed only as a
 * side effect of confirming a purchase order (`writePurchaseOrder`) or of the
 * seed, so a customer meant to *start* on the shop could not be entered at all.
 *
 * Two writes in one transaction, then the email **after** it commits. A Resend
 * outage must not roll back a customer the reader has just typed in; a unique
 * clash must not leave half a customer behind.
 */
export async function createCustomer(
  input: CreateCustomerInput,
): Promise<ActionResult<CreatedCustomer>> {
  try {
    await requireSuperAdmin();
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return { success: false, error: cause.message };
    throw cause;
  }

  const parsed = createCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That customer could not be created.",
    };
  }
  const { company, contact, sendInvite } = parsed.data;

  // Hashed before the transaction opens: bcrypt at cost 12 takes a few hundred
  // milliseconds, and spending that inside a transaction holds a Neon
  // connection open for no reason.
  const password = contact ? temporaryPassword() : null;
  const passwordHash = password ? await hashPassword(password) : null;

  let created: { buyerId: string; contact: { name: string; email: string } | null };
  try {
    created = await prisma.$transaction(async (tx) => {
      const buyer = await tx.buyer.create({ data: company, select: { id: true } });
      if (!contact || !passwordHash) return { buyerId: buyer.id, contact: null };
      const user = await tx.user.create({
        data: {
          name: contact.name,
          email: contact.email,
          username: contact.username,
          phone: contact.phone,
          role: Role.CLIENT,
          buyerId: buyer.id,
          passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword: true,
        },
        select: { id: true, name: true, email: true },
      });
      return { buyerId: buyer.id, contact: { name: user.name, email: user.email } };
    });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return { success: false, error: uniqueMessage(cause.meta?.target) };
    }
    console.error("[customers] createCustomer", cause);
    return { success: false, error: "We couldn't create that customer." };
  }

  let invite: CreatedCustomer["invite"] = "skipped";
  if (created.contact && password && sendInvite) {
    invite = (await sendInviteEmail(created.contact, password)) ? "sent" : "failed";
  }

  revalidatePath("/buyers");
  return { success: true, data: { buyerId: created.buyerId, invite } };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/actions/customers.test.ts`
Expected: PASS, all cases.

- [ ] **Step 6: Write the failing tests for the widened invite and the new patch action**

In `src/actions/clients.test.ts`: extend the shared `input` constant and add cases. Replace the `const input = …` line with:

```ts
const input = {
  buyerId: "buyer-1",
  name: "Siti",
  email: "siti@buyer.com",
  username: "Siti.Ops",
  phone: " +60 12-345 6789 ",
};
```

Add to the `inviteBuyerContact` describe block:

```ts
it("writes the handle lower-cased and the phone trimmed", async () => {
  await inviteBuyerContact(input);
  const data = userCreate.mock.calls[0][0].data;
  expect(data.username).toBe("siti.ops");
  expect(data.phone).toBe("+60 12-345 6789");
});

it("refuses a contact with no handle", async () => {
  const { username, ...rest } = input;
  const result = await inviteBuyerContact(rest as typeof input);
  expect(result.success).toBe(false);
  expect(userCreate).not.toHaveBeenCalled();
});
```

Add a new describe block at the end of the file:

```ts
describe("updateBuyerContact", () => {
  const patch = { name: "Siti Nur", username: "siti.nur", phone: null };

  beforeEach(() => {
    userFindUnique.mockResolvedValue({ id: "c1", role: "CLIENT", buyerId: "buyer-1" });
  });

  it("refuses a member", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireSuperAdmin.mockRejectedValue(new UnauthorizedError("Super admin only."));
    expect(await updateBuyerContact("c1", patch)).toEqual({
      success: false,
      error: "Super admin only.",
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("refuses a row that is not a client — an ops user is not editable here", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", role: "MEMBER", buyerId: null });
    expect(await updateBuyerContact("u1", patch)).toEqual({
      success: false,
      error: "That contact is gone.",
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("writes only name, username and phone — never the email or the role", async () => {
    await updateBuyerContact("c1", patch);
    const data = userUpdate.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual(["name", "phone", "username"]);
  });

  it("names a duplicate handle", async () => {
    const { Prisma } = await import("@/generated/prisma/client");
    userUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "7",
        meta: { target: ["username"] },
      }),
    );
    expect(await updateBuyerContact("c1", patch)).toEqual({
      success: false,
      error: "That username is taken.",
    });
  });
});
```

Update the import line at the top of the file to include the new export:

```ts
const { inviteBuyerContact, resendClientInvite, setClientAccess, updateBuyerContact } =
  await import("@/actions/clients");
```

- [ ] **Step 7: Run them to verify they fail**

Run: `npx vitest run src/actions/clients.test.ts`
Expected: FAIL — `updateBuyerContact is not a function`, and the two new `inviteBuyerContact` cases fail because the action does not write `username`/`phone`.

- [ ] **Step 8: Rewrite `clients.ts` onto the shared helpers**

In `src/actions/clients.ts`:

1. Delete the local `BCRYPT_COST`, `temporaryPassword` and `clientSignInUrl` definitions and the `randomBytes` / `hash` / `sendEmail` / `env` / `TemporaryPassword` imports they needed. Import instead:

```ts
import {
  hashPassword,
  sendInviteEmail,
  temporaryPassword,
  uniqueMessage,
} from "@/lib/client-invites";
import {
  contactPatchSchema,
  inviteContactSchema,
  type ContactPatch,
  type InviteContactInput,
} from "@/lib/validation/clients";
```

2. In `inviteBuyerContact`, add the two fields to the `create` and swap the email call:

```ts
    const created = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        username: data.username,
        phone: data.phone,
        role: Role.CLIENT,
        buyerId: buyer.id,
        passwordHash: await hashPassword(password),
        passwordChangedAt: new Date(),
        mustChangePassword: true,
      },
      select: { id: true, name: true, email: true },
    });

    await sendInviteEmail(created, password);
```

3. Replace its P2002 branch's hard-coded message with `uniqueMessage(cause.meta?.target)`.

4. In `resendClientInvite`, swap `await hash(password, BCRYPT_COST)` for `await hashPassword(password)` and the inline `sendEmail({…})` for `await sendInviteEmail(contact, password)`.

5. Append the new action:

```ts
/**
 * Name, username and phone. Deliberately not the email: that is how the
 * account is identified, and changing it is a different, riskier operation.
 */
export async function updateBuyerContact(
  contactId: string,
  patch: ContactPatch,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = contactPatchSchema.safeParse(patch);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Those changes could not be saved.",
    };
  }

  try {
    const contact = await prisma.user.findUnique({
      where: { id: contactId },
      select: { id: true, role: true, buyerId: true },
    });
    if (!contact || contact.role !== Role.CLIENT) {
      return { success: false, error: "That contact is gone." };
    }

    await prisma.user.update({ where: { id: contact.id }, data: parsed.data });
    if (contact.buyerId) revalidatePath(`/buyers/${contact.buyerId}`);
    return { success: true, data: undefined };
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return { success: false, error: uniqueMessage(cause.meta?.target) };
    }
    console.error("[clients] updateBuyerContact", cause);
    return { success: false, error: "We couldn't save those changes." };
  }
}
```

- [ ] **Step 9: Run both action test files**

Run: `npx vitest run src/actions/clients.test.ts src/actions/customers.test.ts`
Expected: PASS.

- [ ] **Step 10: Widen the two queries and `buyerPatchSchema`**

In `src/lib/queries/clients.ts`, add `username: true, phone: true` to the `select` and to `BuyerContact`:

```ts
export type BuyerContact = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  phone: string | null;
  image: string | null;
  disabledAt: Date | null;
  lastActiveAt: Date | null;
  /** True until they have signed in and set their own password. */
  invited: boolean;
};
```

In `src/lib/queries/buyer-detail.ts`, add `remark: string | null;` to `BuyerDetail["buyer"]` (after `paymentTerms`) and `remark: true,` to the `findUnique` `select` (after `paymentTerms: true,`).

In `src/actions/buyers.ts`, add `remark: emptyToNull,` to `buyerPatchSchema` after `paymentTerms`.

- [ ] **Step 11: Run the full suite, typecheck and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS. `tsc` is the check that matters here — `BuyerDetailsCard` and `BuyerContactsCard` consume these types and Task 4 updates them, so a `tsc` error naming those two files is expected only if you added the fields to the props types; if `tsc` fails elsewhere, fix it before committing.

- [ ] **Step 12: Commit**

```bash
git add src/lib/client-invites.ts src/actions/customers.ts src/actions/customers.test.ts \
        src/actions/clients.ts src/actions/clients.test.ts src/lib/queries/clients.ts \
        src/lib/queries/buyer-detail.ts src/actions/buyers.ts
git commit -m "feat(customers): create a customer, its contact and its invitation in one action"
```

---

### Task 3: The new-customer screen

**Files:**
- Create: `src/app/(portal)/buyers/new/page.tsx`
- Create: `src/app/(portal)/buyers/new/loading.tsx`
- Create: `src/components/buyers/CustomerForm.tsx`
- Modify: `src/app/(portal)/buyers/page.tsx` (the `PageHeader` action)

**Interfaces:**
- Consumes: `createCustomer` and `CreateCustomerInput` from Task 2; `useUrlNavigation` from `src/hooks/useUrlNavigation`; `BackLink`, `Button`, `Input`, `Textarea`, `Switch` from the existing UI set.
- Produces: the route `/buyers/new`. Nothing imports this task's components.

- [ ] **Step 1: Build the form component**

Create `src/components/buyers/CustomerForm.tsx`. Follow `src/components/products/ProductForm.tsx`'s idiom exactly — the `label` class constant, `useUrlNavigation`'s `push`, `busy = saving || navigating`, values kept on failure.

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createCustomer } from "@/actions/customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

type Company = {
  name: string;
  address: string;
  paymentTerms: string;
  remark: string;
  contactName: string;
  email: string;
  phone: string;
};
type Contact = { name: string; username: string; email: string; phone: string };

const BLANK_COMPANY: Company = {
  name: "",
  address: "",
  paymentTerms: "",
  remark: "",
  contactName: "",
  email: "",
  phone: "",
};
const BLANK_CONTACT: Contact = { name: "", username: "", email: "", phone: "" };

/**
 * Creating a customer: the company, the person who signs the paperwork, and
 * optionally the person who signs in to the shop. Those last two are often the
 * same human and often are not, which is why the shop block prefills from the
 * point of contact rather than reusing it.
 */
export function CustomerForm() {
  const { pending: navigating, push } = useUrlNavigation();
  const [company, setCompany] = useState<Company>(BLANK_COMPANY);
  const [contact, setContact] = useState<Contact>(BLANK_CONTACT);
  const [wantsLogin, setWantsLogin] = useState(false);
  const [sendInvite, setSendInvite] = useState(true);
  const [saving, setSaving] = useState(false);

  const busy = saving || navigating;
  const setC = <K extends keyof Company>(key: K, value: Company[K]) =>
    setCompany((current) => ({ ...current, [key]: value }));
  const setP = <K extends keyof Contact>(key: K, value: Contact[K]) =>
    setContact((current) => ({ ...current, [key]: value }));

  // A prefill, not a binding: editing either side afterwards does not re-sync
  // them. Only empty fields are filled, so reopening the block never
  // overwrites what was typed into it.
  const openLogin = (on: boolean) => {
    setWantsLogin(on);
    if (!on) return;
    setContact((current) => ({
      ...current,
      name: current.name || company.contactName,
      email: current.email || company.email,
      phone: current.phone || company.phone,
    }));
  };

  const submit = async () => {
    setSaving(true);
    const result = await createCustomer({
      company,
      contact: wantsLogin
        ? {
            name: contact.name,
            username: contact.username,
            email: contact.email,
            phone: contact.phone,
          }
        : undefined,
      sendInvite,
    });
    if (!result.success) {
      setSaving(false);
      toast.error(result.error);
      return;
    }
    // `toast.warning` appears nowhere else in this codebase — sonner 2.x has
    // it, but whether this project's `<Toaster>` styles it legibly is unknown
    // until it is seen. Step 5 checks it; if it renders unstyled, fall back to
    // `toast.success` with the same words. It is not an error: the customer
    // was created.
    toast[result.data.invite === "failed" ? "warning" : "success"](
      result.data.invite === "sent"
        ? "Customer created and invitation sent."
        : result.data.invite === "failed"
          ? "Customer created, but we couldn't send the invitation. Use Resend invite on their page."
          : "Customer created.",
    );
    push(`/buyers/${result.data.buyerId}`);
  };

  return (
    <form
      className="max-w-panel-lg"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {/* Not `PageHeader`: the title here is the Name field rather than text,
          and an `<input>` cannot live inside its `<h1>`. */}
      <header className="mb-lg">
        <p className={label}>{company.name ? "Customer" : "New customer"}</p>
        <h1 className="sr-only">New customer</h1>
        <Input
          aria-label="Customer name"
          placeholder="Customer name"
          value={company.name}
          onChange={(event) => setC("name", event.target.value)}
          className="h-auto rounded-none border-0 border-b border-hairline-strong px-0 py-xxs font-display text-[length:var(--text-heading-md)] leading-[1.2] font-[650] tracking-[-0.91px] text-ink placeholder:text-ink-disabled focus-visible:border-focus focus-visible:ring-0 sm:text-[length:var(--text-display-md)] sm:tracking-[-1.36px]"
        />
      </header>

      <section className="mb-lg flex flex-col gap-md rounded-lg border border-hairline bg-canvas p-lg">
        <h2 className={label}>Company</h2>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="customer-address" className={label}>
            Delivery address
          </label>
          <Textarea
            id="customer-address"
            rows={3}
            value={company.address}
            onChange={(event) => setC("address", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="customer-terms" className={label}>
            Payment terms
          </label>
          <Input
            id="customer-terms"
            placeholder="30 days"
            value={company.paymentTerms}
            onChange={(event) => setC("paymentTerms", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="customer-remark" className={label}>
            Remark
          </label>
          <Textarea
            id="customer-remark"
            rows={3}
            value={company.remark}
            onChange={(event) => setC("remark", event.target.value)}
          />
          <p className={caption}>Only our team sees this — it never appears on the shop.</p>
        </div>
      </section>

      <section className="mb-lg flex flex-col gap-md rounded-lg border border-hairline bg-canvas p-lg">
        <h2 className={label}>Point of contact</h2>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="customer-poc" className={label}>
            Name
          </label>
          <Input
            id="customer-poc"
            value={company.contactName}
            onChange={(event) => setC("contactName", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="customer-email" className={label}>
            Email
          </label>
          <Input
            id="customer-email"
            type="email"
            value={company.email}
            onChange={(event) => setC("email", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="customer-phone" className={label}>
            Phone
          </label>
          <Input
            id="customer-phone"
            value={company.phone}
            onChange={(event) => setC("phone", event.target.value)}
          />
        </div>
      </section>

      <section className="mb-lg flex flex-col gap-md rounded-lg border border-hairline bg-canvas p-lg">
        <div className="flex flex-wrap items-center justify-between gap-xs">
          <h2 className={label}>Shop access</h2>
          <label className="flex items-center gap-xs text-[length:var(--text-body-sm)] text-ink">
            <Switch checked={wantsLogin} onCheckedChange={openLogin} />
            Give them a shop login
          </label>
        </div>

        {wantsLogin ? (
          <>
            <div className="flex flex-col gap-xxs">
              <label htmlFor="contact-name" className={label}>
                Contact name
              </label>
              <Input
                id="contact-name"
                value={contact.name}
                onChange={(event) => setP("name", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-xxs">
              <label htmlFor="contact-username" className={label}>
                Username
              </label>
              <Input
                id="contact-username"
                value={contact.username}
                onChange={(event) => setP("username", event.target.value)}
              />
              <p className={caption}>
                They sign in with their email address; this is just how we refer to them.
              </p>
            </div>
            <div className="flex flex-col gap-xxs">
              <label htmlFor="contact-email" className={label}>
                Email
              </label>
              <Input
                id="contact-email"
                type="email"
                value={contact.email}
                onChange={(event) => setP("email", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-xxs">
              <label htmlFor="contact-phone" className={label}>
                Phone
              </label>
              <Input
                id="contact-phone"
                value={contact.phone}
                onChange={(event) => setP("phone", event.target.value)}
              />
            </div>
            <label className="flex items-center gap-xs text-[length:var(--text-body-sm)] text-ink">
              <Switch checked={sendInvite} onCheckedChange={setSendInvite} />
              Send the invitation email
            </label>
          </>
        ) : (
          <p className={caption}>
            They can be invited later from their own page.
          </p>
        )}
      </section>

      <Button type="submit" pending={busy}>
        Create customer
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Build the page and its skeleton**

Create `src/app/(portal)/buyers/new/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { BackLink } from "@/components/portal/BackLink";
import { CustomerForm } from "@/components/buyers/CustomerForm";
import { getSessionUser } from "@/lib/auth-guards";

export const metadata: Metadata = {
  title: "New customer · Loving Hands Portal",
};
export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  const user = await getSessionUser();
  // The directory only offers this link to a super admin, but the link is a
  // URL and anyone can type it. `createCustomer` refuses either way; this is
  // so a member sees the directory rather than a form that can never save.
  if (user?.role !== Role.SUPER_ADMIN) redirect("/buyers");

  return (
    <>
      <BackLink fallbackHref="/buyers" />
      <nav aria-label="Breadcrumb" className="mb-xs">
        <Link
          href="/buyers"
          className="inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
        >
          Buyers
        </Link>
        <span className="text-[length:var(--text-body-sm)] text-ink-tertiary">
          {" / "}
          New customer
        </span>
      </nav>

      <CustomerForm />
    </>
  );
}
```

Create `src/app/(portal)/buyers/new/loading.tsx`:

```tsx
import { HeaderSkeleton, PageSkeleton, Shimmer } from "@/components/portal/Skeletons";

export default function NewCustomerLoading() {
  return (
    <PageSkeleton>
      <Shimmer className="mb-xs h-4 w-20" />
      <Shimmer className="mb-xs h-4 w-44" />
      <HeaderSkeleton />

      <div className="flex max-w-panel-lg flex-col gap-lg">
        {Array.from({ length: 3 }, (_, card) => (
          <section key={card} className="rounded-lg border border-hairline bg-canvas p-lg">
            <Shimmer className="h-4 w-24" />
            <div className="mt-md flex flex-col gap-md">
              {Array.from({ length: 3 }, (_, field) => (
                <div key={field} className="flex flex-col gap-xxs">
                  <Shimmer className="h-4 w-20" />
                  <Shimmer className="h-control-md w-full rounded-sm" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageSkeleton>
  );
}
```

- [ ] **Step 3: Add the New customer button to `/buyers`**

In `src/app/(portal)/buyers/page.tsx`, the page already resolves a session for other purposes; if it does not, add `const user = await getSessionUser();` beside the existing data loads and import `getSessionUser` and `Role`. Then replace the `PageHeader` action:

```tsx
        action={
          <div className="flex flex-wrap gap-xs">
            {user?.role === Role.SUPER_ADMIN ? (
              // A real anchor, not a router push: cmd-click opens a tab for
              // free, the reasoning /products/new already recorded.
              <Button asChild variant="secondary">
                <Link href="/buyers/new">
                  <LinkSpinner />
                  New customer
                </Link>
              </Button>
            ) : null}
            <UploadPoButton />
          </div>
        }
```

Import `Link` from `next/link`, `Button` from `@/components/ui/button` and `LinkSpinner` from `@/components/portal/LinkSpinner` if they are not already imported. **Upload PO keeps the ink pill** — it is the page's primary action — so New customer takes `variant="secondary"`.

- [ ] **Step 4: Typecheck, lint and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Verify in the browser as a super admin**

Start `npm run dev`. Sign in as a super admin (promote the seeded member temporarily if needed, and revert in Task 6).

1. `/buyers` → **New customer** is present beside Upload PO. Click it.
2. Fill every field including a remark with two lines and a shop login; leave *Send the invitation email* on. Submit.
3. Expected: toast "Customer created and invitation sent."; you land on `/buyers/{id}`; the details card shows the address, terms and point of contact; the contacts card lists the new contact as **Invited**.
4. Back to `/buyers` → the new row is in the directory.
5. Create a second customer with company fields only and the toggle off. Expected: toast "Customer created."; no contact row; confirm no email was sent by checking the dev server log for a Resend call.
6. Submit a third with the same name as the first. Expected: "Another customer already has that name.", the typed values still in the form, and no new row (`prisma.buyer.count()` before and after).
7. Submit a fourth with a fresh company name but the first contact's username. Expected: "That username is taken." and **zero** rows added — check both `buyer.count()` and `user.count()`, because this is the case where a partial write would show.
8. Force the failed-invite path once: stop the mail provider from working (unset `RESEND_API_KEY` in `.env.local` and restart, or point it at a bad key) and create a fifth customer with a login. Expected: the customer and contact **exist** and the warning toast appears. Screenshot it — if `toast.warning` renders unstyled or illegibly, switch to `toast.success` with the same words and note the change. Restore the key afterwards.

- [ ] **Step 6: Verify a member cannot reach it**

Sign in as a MEMBER. Expected: `/buyers` shows no New customer button; typing `/buyers/new` lands on `/buyers`. Then, from the browser console on the portal host, call the action's endpoint indirectly by confirming the redirect — the server-side refusal is already unit-tested in Task 2, so the browser check is the redirect only.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(portal)/buyers/new" src/components/buyers/CustomerForm.tsx "src/app/(portal)/buyers/page.tsx"
git commit -m "feat(customers): the new-customer screen"
```

---

### Task 4: Editing a customer afterwards

**Files:**
- Modify: `src/components/buyers/BuyerDetailsCard.tsx`
- Modify: `src/components/buyers/BuyerContactsCard.tsx`
- Modify: `src/app/(portal)/buyers/[id]/page.tsx:241-252` (pass `remark` through)
- Create: `src/actions/buyers.test.ts`

**Interfaces:**
- Consumes: `updateBuyerContact` and the widened `BuyerContact` from Task 2; `buyerPatchSchema` with `remark` from Task 2 Step 10.
- Produces: nothing other tasks import.

- [ ] **Step 1: Write the failing `buyerPatchSchema` tests**

Create `src/actions/buyers.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const buyerUpdate = vi.fn();
const requireUser = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: { buyer: { update: buyerUpdate } } }));
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireUser,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { updateBuyer } = await import("@/actions/buyers");

beforeEach(() => {
  vi.resetAllMocks();
  requireUser.mockResolvedValue({ id: "u1", role: "MEMBER" });
  buyerUpdate.mockResolvedValue({});
});

describe("updateBuyer", () => {
  it("lets a member write a remark, trimmed", async () => {
    const result = await updateBuyer("b1", { remark: "  Chase on day 25.  " });
    expect(result.success).toBe(true);
    expect(buyerUpdate.mock.calls[0][0].data.remark).toBe("Chase on day 25.");
  });

  it("clears the remark when it is blanked", async () => {
    await updateBuyer("b1", { remark: "   " });
    expect(buyerUpdate.mock.calls[0][0].data.remark).toBeNull();
  });

  it("still refuses a member renaming the buyer", async () => {
    const result = await updateBuyer("b1", { name: "New Name" });
    expect(result).toEqual({
      success: false,
      error: "Only a super admin can rename a buyer.",
    });
    expect(buyerUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/actions/buyers.test.ts`
Expected: FAIL on the two remark cases — `remark` is not in the patch schema's output. (It passes if Task 2 Step 10 was already done; in that case confirm all three pass and move on.)

- [ ] **Step 3: Make it pass**

`remark: emptyToNull,` was added to `buyerPatchSchema` in Task 2 Step 10. If that step was skipped, add it now. Re-run: PASS.

- [ ] **Step 4: Add the Remark row to `BuyerDetailsCard`**

In `src/components/buyers/BuyerDetailsCard.tsx`:

1. Add `remark: string | null;` to `BuyerDetails`.
2. Add `remark: buyer.remark,` to the `useState<BuyerPatch>` initialiser.
3. Render the row inside the second `<dl>` (the one holding Payment terms and Buyer since, at `src/components/buyers/BuyerDetailsCard.tsx:177`), after Buyer since. It uses the same `dt`/`dd` classes as its siblings, and differs in exactly one way: `whitespace-pre-wrap` instead of `truncate`, because a remark is prose with line breaks rather than a one-line value.

```tsx
        {buyer.remark ? (
          <div>
            <dt className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
              Remark
            </dt>
            <dd className="whitespace-pre-wrap text-[length:var(--text-body-md)] text-ink">
              {buyer.remark}
            </dd>
          </div>
        ) : null}
```

Omitted when null, like the contact rows above it — Payment terms and Buyer since render "Not set" / "No orders yet" because they are always knowable, and a remark is not.

4. In the edit sheet, add a `Textarea` for Remark below Payment terms, with the caption "Only our team sees this — it never appears on the shop." Import `Textarea` from `@/components/ui/textarea`.

5. In `src/app/(portal)/buyers/[id]/page.tsx`, pass `remark` through to `BuyerDetailsCard` — the page spreads `detail.buyer`, so this is only a change if it names fields explicitly. Check and adjust.

- [ ] **Step 5: Add Username and Phone to the invite form**

In `src/components/buyers/BuyerContactsCard.tsx`, add `const [username, setUsername] = useState("")` and `const [phone, setPhone] = useState("")`, two more `Input`s in the invite form (`aria-label="Contact username"` and `aria-label="Contact phone"`), pass them to `inviteBuyerContact({ buyerId, name, email, username, phone })`, and clear all four on success.

- [ ] **Step 6: Add per-contact editing**

Still in `BuyerContactsCard`, add `const [editing, setEditing] = useState<string | null>(null)` and a draft state `const [draft, setDraft] = useState({ name: "", username: "", phone: "" })`. For a `canManage` reader, add an **Edit** `Button variant="secondary"` beside Resend that sets `editing` to the contact's id and seeds `draft` from that contact. When `editing === contact.id`, render three `Input`s and Save / Cancel in place of the row's caption block; Save runs through the existing `run()` helper:

```tsx
void run(`edit-${contact.id}`, async () => {
  const result = await updateBuyerContact(contact.id, draft);
  if (result.success) {
    toast.success("Contact updated.");
    setEditing(null);
  }
  return result;
});
```

Add `updateBuyerContact` to the import from `@/actions/clients`. The row's caption line becomes `{contact.username ? `${contact.username} · ` : ""}{contact.email}`, with the phone on its own line below when present.

- [ ] **Step 7: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 8: Verify in the browser**

On a buyer detail page as a super admin:
1. Edit the remark to two lines → the row renders both lines; clear it → the row disappears entirely rather than showing an empty label.
2. As a MEMBER, the remark is still editable and the buyer name is not.
3. Invite a contact with a username and a phone → both appear on the row.
4. Edit that contact's username to one already taken → "That username is taken." and the old value still on screen.
5. Edit the name → the row updates without a reload.

- [ ] **Step 9: Commit**

```bash
git add src/components/buyers/BuyerDetailsCard.tsx src/components/buyers/BuyerContactsCard.tsx \
        "src/app/(portal)/buyers/[id]/page.tsx" src/actions/buyers.test.ts src/actions/buyers.ts
git commit -m "feat(customers): edit a customer's remark and its contacts"
```

---

### Task 5: A customer can change their password again

**Files:**
- Modify: `src/app/(auth)/account/password/page.tsx`
- Modify: `src/components/shop/ShopHeader.tsx:26-48`

**Interfaces:**
- Consumes: `getSessionUser` and `Role`, both already available.
- Produces: nothing other tasks import.

- [ ] **Step 1: Let a non-forced client stay on the page**

In `src/app/(auth)/account/password/page.tsx`, replace the blanket `if (!forced) redirect("/settings#password");` with:

```tsx
  const forced = user.mustChangePassword;
  // A blanket redirect would ping-pong forever for staff: the portal layout
  // sends a `mustChangePassword` user *here*, so only the un-forced case may
  // leave. A client may not leave at all — `/settings` is under `(portal)`,
  // whose layout redirects a CLIENT straight back to the shop host, so
  // sending them there is a dead end (docs/specs/23-customer-profiles.md §0).
  const isClient = user.role === Role.CLIENT;
  if (!forced && !isClient) redirect("/settings#password");
```

Import `Role` from `@/generated/prisma/enums`. The `AuthCard` props already branch on `forced`, so a non-forced client gets "Change your password" and "You'll stay signed in here. Every other browser is signed out." — which is accurate: `ChangePasswordForm`'s non-forced branch ends in `signOut({ redirectTo: "/signin?reset=1" })`, and both that path and the shop's own `/signin` resolve on the shop host.

- [ ] **Step 2: Add the menu row**

In `src/components/shop/ShopHeader.tsx`, add `KeyRound` to the `lucide-react` import and a row above the sign-out separator:

```tsx
  {
    key: "password",
    label: "Change password",
    icon: KeyRound,
    // A literal, NOT shopHref: `shopHref`'s rule exists because storefront
    // paths are rewritten under /shop, and `/account/password` is on
    // `isShared()` in src/proxy.ts precisely so it is not.
    href: "/account/password",
  },
  { key: "sep-password", separator: true },
```

Place it directly after the `orders` row's separator so the order reads *My orders · Change password · Talk to our team · Sign out*.

- [ ] **Step 3: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Drive the whole invitation loop in the browser**

`SHOP_HOST` and `SHOP_URL` must be set for the shop host to exist locally — check `.env.local`. If Chrome refuses `shop.localhost` (the 2026-09-10 environment issue), export `SHOP_HOST`/`SHOP_URL` to `foo.localhost` and use that; confirm with `curl` that both hosts behave identically first.

As the customer created in Task 3:
1. Read the temporary password from the dev server's email output (or the Resend dashboard).
2. Sign in at the shop host → forced change page → set a password. Land on the shop.
3. Open the account menu → **Change password** is there → click → the page renders *Change your password* with a current-password field (not the forced variant).
4. Change it to a third password → signed out → `/signin?reset=1` on the shop host.
5. Sign in with the third password: works. Sign in with the second: **fails** — read the failure from the wire (the 401/error response), not only the toast.

- [ ] **Step 5: Confirm the staff path is unchanged**

As an ops MEMBER with no forced flag, visit `/account/password` on the portal host. Expected: still redirected to `/settings#password`, which still renders.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(auth)/account/password/page.tsx" src/components/shop/ShopHeader.tsx
git commit -m "feat(shop): a customer can change their password more than once"
```

---

### Task 6: Verification, leak assertions and cleanup

**Files:**
- Modify: `src/lib/shop-viewer.test.ts`
- Modify: `context/current-feature.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Assert the one shop-side buyer select by equality**

A shop page reads a `Buyer` in exactly one place: `loadShopViewer`
(`src/lib/shop-viewer.ts:24`), which runs in the storefront layout on every
shop request and supplies the company name to the header and account menu.
`notifyOps` (`src/actions/cart.ts:440`) and `loadWebOrderForReview`
(`src/lib/queries/web-orders.ts:284`) look like candidates and are **not** —
the first composes an email to ops staff, the second feeds the ops review
screen, which already selects `notes` on purpose. Neither renders to a
customer, so neither gets an assertion here.

Append to `src/lib/shop-viewer.test.ts`, inside the existing `describe("loadShopViewer", …)`:

```ts
  it("asks the buyer for its name and nothing else — Buyer.remark is ops-only", async () => {
    getSessionUser.mockResolvedValue({ id: "u1", role: "CLIENT" });
    userFindUnique.mockResolvedValue({
      name: "Aisha Rahman",
      email: "aisha@acme.test",
      image: null,
      buyerId: "b1",
      buyer: { name: "Acme Industrial Sdn Bhd" },
    });
    await loadShopViewer();
    // An equality, not a subset: this is the only Buyer read on a shop page,
    // so widening it has to be a deliberate edit to this line.
    expect(userFindUnique.mock.calls[0][0].select.buyer).toEqual({
      select: { name: true },
    });
  });
```

- [ ] **Step 1b: Run it and confirm it would catch a leak**

Run: `npx vitest run src/lib/shop-viewer.test.ts`
Expected: PASS. Then temporarily add `remark: true` to the `buyer.select` in `src/lib/shop-viewer.ts`, re-run, and confirm the test FAILS — a guard that has never been seen to fail is not known to guard anything. Revert the temporary edit and re-run: PASS.

- [ ] **Step 2: Run everything**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all PASS. Record the test count for the history entry.

- [ ] **Step 3: Sweep for overflow**

At 390, 768 and 1440, on `/buyers`, `/buyers/new` and a buyer detail page with a remark and two contacts (nine combinations): assert `document.documentElement.scrollWidth === window.innerWidth`. At 390 only, list every interactive element under 44px and confirm each is one of the already-accepted exceptions recorded on 2026-09-10 (the search input/button and the category nav chips) — a new one is a defect to fix, not to record.

- [ ] **Step 4: Remove the test data**

Report `Buyer` and `User` counts before and after:

```bash
npx tsx -e "
import { prisma } from './src/lib/prisma';
console.log('buyers', await prisma.buyer.count(), 'users', await prisma.user.count());
await prisma.\$disconnect();
"
```

Delete every customer and contact created while testing, plus their `LoginAttempt` rows. Revert the seeded member's role if it was promoted in Task 3. Confirm the counts return to what they were, and that `prisma.user.count({ where: { role: 'CLIENT' } })` reads 0.

**Nothing on production.** This branch has not been deployed.

- [ ] **Step 5: Write the history entry**

Append to `context/current-feature.md`'s History, dated 2026-09-11, in the house style: what was measured rather than asserted (the row counts on the two P2002 cases, the wire reading on the old password failing, the nine overflow combinations), what was **not** verified (anything on production; the ops upload → extract → confirm write path, untouched by this branch), and that Phase 21 still owns the customer's own settings screen. Update the Status block to name Phase 23 as landed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shop-viewer.test.ts context/current-feature.md
git commit -m "docs: record Phase 23 as built and verified"
```

- [ ] **Step 7: Stop and report**

Do **not** merge. Report to the user: the test count, the before/after row counts, the overflow sweep result, and anything that did not work. Merging to `main` and deleting the branch is their call (`context/ai-interaction.md` steps 7–8).

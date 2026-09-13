# Admin › Customers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A super admin creates, edits and deletes a customer, resets a shop contact's password, removes a contact, and reads that customer's activity — from one Customers section in the admin room, with the create button as its only CTA rather than a grey pill beside *Upload PO*.

**Architecture:** A second section in the existing `(admin)` shell (`/admin/customers`, `/new`, `/[id]`), reusing `BuyerDetailsCard` and `BuyerContactsCard` unchanged in substance. Three new Server Actions whose deletes are **refused** whenever an order references the row. One new table, `AuditEvent`, written inside the same transaction as every customer mutation and on every successful CLIENT sign-in, which is what makes the activity timeline durable — `LoginAttempt` is swept after 24 hours and cannot be a history.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 (`@theme` tokens only), Prisma 7 on Neon, Zod 4, Vitest.

**Spec:** `docs/specs/25-admin-customers.md` — read it alongside this plan. Section references (§1, §2…) point at it.

## Global Constraints

- **Super admin only, twice.** The `(admin)` layout and `src/proxy.ts` already 404 everyone else; every new action calls `requireSuperAdmin()` anyway — a route guard is not an authorisation model.
- **Nothing secret in the audit trail.** `AuditEvent.detail` carries field *names*, counts and references. Never a password (temporary or otherwise), never the value of `Buyer.remark`, never an email body.
- **Deletes are refused, not cascaded.** A `PurchaseOrder`, `WebOrder` or `PoStageEvent` must never point at a buyer or contact that no longer exists. The database restricts these FKs anyway; the checks exist to turn a Postgres error into a sentence a person can act on.
- **No shop `select` widens.** `src/lib/shop-viewer.test.ts` asserts `select.buyer` by equality and must pass untouched.
- **Bcrypt before the transaction, email after it.** Hashing at cost 12 takes hundreds of milliseconds and must not hold a Neon connection; a Resend outage must not roll back a write. Both rules are load-bearing and were learned in Phase 23.
- **Tailwind v4 CSS config only.** Never create `tailwind.config.ts`. All colour, type, radius and spacing from the `@theme` tokens in `src/app/globals.css`. No raw hex, no px font size, no arbitrary value like `text-[15px]`. `text-[length:var(--text-body-sm)]` is the established idiom and is correct.
- Sentence-case labels. Primary CTA is the dark `bg-ink` pill (the `Button` default variant), never purple. 44px minimum touch target below `sm`. No horizontal overflow at 390/768/1440.
- TypeScript strict, no `any`. Every Server Action returns `{ success, data, error }` and never throws to the caller.
- Migrations: hand-written file plus `timeout 120 npx prisma migrate deploy`. **Never** `migrate dev` (it has hung on this machine and prompts in a way a non-TTY cannot answer). Never `migrate reset` or any destructive database command. Never edit `.env.local`.
- Tests: `npm test` (`vitest run`); one file with `npx vitest run <path>`.
- Conventional commit messages ending with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Never write "Generated with Claude".

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/lib/audit.ts` | `audit()` (one write, works inside or outside a transaction), `changedFields()`, the detail types |
| `src/lib/audit.test.ts` | those three, including "an unchanged field is not a change" |
| `src/lib/client-sign-in.ts` | `recordClientSignIn()` — fire-and-forget SIGNED_IN write, its own module so it is testable without instantiating NextAuth |
| `src/lib/client-sign-in.test.ts` | writes for a CLIENT, writes nothing for staff, never rejects |
| `src/lib/queries/admin-customers.ts` | `listCustomers()`, `selectCustomers()`, `loginsLabel()`, `CUSTOMER_SORT_KEYS` |
| `src/lib/queries/admin-customers.test.ts` | search, sort, the logins label |
| `src/lib/queries/customer-activity.ts` | the four source reads, the pure mappers, `mergeActivity()` |
| `src/lib/queries/customer-activity.test.ts` | ordering, paging, filtering, every audit sentence |
| `src/components/admin/AdminNav.tsx` | the Users · Customers tab strip |
| `src/components/admin/CustomersTable.tsx` | search, sort, the five columns |
| `src/components/admin/CustomerActivity.tsx` | filter chips, the entry list, pagination |
| `src/components/admin/DeleteCustomer.tsx` | the danger zone and its type-the-name dialog |
| `src/app/(admin)/admin/customers/page.tsx` + `loading.tsx` | the table route |
| `src/app/(admin)/admin/customers/new/page.tsx` + `loading.tsx` | the create route |
| `src/app/(admin)/admin/customers/[id]/page.tsx` + `loading.tsx` | the detail route |
| `prisma/migrations/20260913090000_audit_events/migration.sql` | the enum, the table, three SetNull FKs, two indexes |

**Modified**

| File | Change |
|---|---|
| `prisma/schema.prisma` | `AuditAction` enum, `AuditEvent` model, three back-relations |
| `src/actions/customers.ts` | audit in `createCustomer`; new `deleteBuyer` |
| `src/actions/clients.ts` | audit in the four existing actions; new `resetClientPassword`, `removeBuyerContact`; `resendClientInvite` becomes an alias |
| `src/actions/buyers.ts` | audit in `updateBuyer`, which now reads the row first to know what changed |
| `src/lib/auth.ts` | one call to `recordClientSignIn` after a successful credentials sign-in |
| `src/components/buyers/BuyerContactsCard.tsx` | the per-contact button row becomes one overflow menu; two new dialogs |
| `src/components/buyers/CustomerForm.tsx` | required `afterCreate` prop |
| `src/components/portal/UploadPoButton.tsx` | optional `variant` prop |
| `src/app/(admin)/layout.tsx` | renders `AdminNav` |
| `src/app/(portal)/buyers/page.tsx` | New customer becomes the ink pill for a super admin |
| `src/app/(portal)/buyers/new/page.tsx` | passes `afterCreate="/buyers"` |
| `src/app/(portal)/buyers/[id]/page.tsx` | "Manage in Admin ›" link for a super admin |
| `context/current-feature.md` | Phase 25 status and history |

---

### Task 1: The audit table and its helper

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260913090000_audit_events/migration.sql`
- Create: `src/lib/audit.ts`
- Test: `src/lib/audit.test.ts`

**Interfaces:**
- Produces: `audit(writer, event)`, `changedFields(patch, current)`, types `AuditInput`, `AuditDetail`, `AuditWriter` from `@/lib/audit`; the `AuditEvent` model and `AuditAction` enum. Every later task consumes these.

- [ ] **Step 1: Add the model and enum to the schema**

Append to `prisma/schema.prisma` (after the `Buyer` model is fine; Prisma does not care about order):

```prisma
enum AuditAction {
  CUSTOMER_CREATED
  CUSTOMER_UPDATED
  CUSTOMER_DELETED
  CONTACT_INVITED
  CONTACT_UPDATED
  CONTACT_REMOVED
  CONTACT_DISABLED
  CONTACT_RESTORED
  PASSWORD_RESET
  INVITE_RESENT
  SIGNED_IN
}

/**
 * Who did what to a customer's account, and when a customer signed in.
 *
 * This exists because `LoginAttempt` cannot answer either question: it is
 * rate-limit state, swept after 24 hours (`src/lib/rate-limit.ts`), and
 * `User.lastActiveAt` is one timestamp with no history behind it.
 *
 * `detail` holds field *names*, counts and references — never a password,
 * never the value of `Buyer.remark`, never an email body.
 */
model AuditEvent {
  id            String      @id @default(cuid())
  action        AuditAction
  /// The person who did it. Null once that user's row is gone.
  actorId       String?
  actor         User?       @relation("auditActor", fields: [actorId], references: [id], onDelete: SetNull)
  /// SetNull, never Cascade: the trail has to outlive the customer it is about.
  buyerId       String?
  buyer         Buyer?      @relation(fields: [buyerId], references: [id], onDelete: SetNull)
  /// The contact acted on, where there is one.
  subjectUserId String?
  subjectUser   User?       @relation("auditSubject", fields: [subjectUserId], references: [id], onDelete: SetNull)
  detail        Json?
  at            DateTime    @default(now())

  @@index([buyerId, at])
  @@index([actorId, at])
}
```

Add the three back-relations. In `model User`, beside the other relation fields:

```prisma
  auditActions       AuditEvent[]         @relation("auditActor")
  auditSubjects      AuditEvent[]         @relation("auditSubject")
```

In `model Buyer`, beside `contacts`:

```prisma
  auditEvents    AuditEvent[]
```

- [ ] **Step 2: Write the migration by hand**

Create `prisma/migrations/20260913090000_audit_events/migration.sql`:

```sql
-- Admin › Customers: the audit trail (docs/specs/25-admin-customers.md §5).

-- One statement creates the type and the table's use of it. This is safe in a
-- single migration, unlike Phase 15's split: Postgres refuses a *newly added
-- value* on an existing enum in the transaction that added it, but a type
-- created here and referenced by a column here is fine — no value literal is
-- written until an application INSERT, long after this commits.
CREATE TYPE "AuditAction" AS ENUM (
    'CUSTOMER_CREATED',
    'CUSTOMER_UPDATED',
    'CUSTOMER_DELETED',
    'CONTACT_INVITED',
    'CONTACT_UPDATED',
    'CONTACT_REMOVED',
    'CONTACT_DISABLED',
    'CONTACT_RESTORED',
    'PASSWORD_RESET',
    'INVITE_RESENT',
    'SIGNED_IN'
);

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actorId" TEXT,
    "buyerId" TEXT,
    "subjectUserId" TEXT,
    "detail" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_buyerId_at_idx" ON "AuditEvent"("buyerId", "at");
CREATE INDEX "AuditEvent_actorId_at_idx" ON "AuditEvent"("actorId", "at");

-- SET NULL on all three, never CASCADE: recording that a customer was deleted
-- is worthless if deleting the customer deletes the record of it.
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_subjectUserId_fkey"
    FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Apply it and regenerate the client**

Run:

```bash
timeout 120 npx prisma migrate deploy && timeout 120 npx prisma generate
```

Expected: `1 migration found` … `Applied`, then `Generated Prisma Client`.
Then confirm the migration is recorded and nothing drifted:

```bash
timeout 120 npx prisma migrate status
```

Expected: "Database schema is up to date!"

- [ ] **Step 4: Write the failing test**

Create `src/lib/audit.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { audit, changedFields } from "@/lib/audit";

const create = vi.fn();
const writer = { auditEvent: { create } };

beforeEach(() => {
  vi.resetAllMocks();
  create.mockResolvedValue({ id: "evt-1" });
});

describe("audit", () => {
  it("writes through whichever client it was handed", async () => {
    await audit(writer, {
      action: "PASSWORD_RESET",
      actorId: "admin-1",
      buyerId: "buyer-1",
      subjectUserId: "contact-1",
      detail: { name: "Siti" },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        action: "PASSWORD_RESET",
        actorId: "admin-1",
        buyerId: "buyer-1",
        subjectUserId: "contact-1",
        detail: { name: "Siti" },
      },
      select: { id: true },
    });
  });

  it("stores explicit nulls rather than leaving columns undefined", async () => {
    await audit(writer, { action: "SIGNED_IN", actorId: "c1", buyerId: "b1" });
    const data = create.mock.calls[0][0].data;
    expect(data.subjectUserId).toBeNull();
    // Prisma treats `undefined` as "do not set", which is what we want for an
    // optional Json column — null would write a JSON null.
    expect(data.detail).toBeUndefined();
  });
});

describe("changedFields", () => {
  it("reports only the keys whose value actually moved", () => {
    const current = { phone: "+60 3-1111", remark: "Chase late", address: "12 Jalan Satu" };
    const patch = { phone: "+60 3-2222", remark: "Chase late" };
    expect(changedFields(patch, current)).toEqual(["phone"]);
  });

  it("ignores keys the patch did not name", () => {
    expect(changedFields({ remark: undefined }, { remark: "x" })).toEqual([]);
  });

  it("counts clearing a field to null as a change", () => {
    expect(changedFields({ phone: null }, { phone: "+60 3-1111" })).toEqual(["phone"]);
  });

  it("sorts, so the same edit always reads the same way", () => {
    const current = { a: "1", b: "2", c: "3" };
    expect(changedFields({ c: "9", a: "9" }, current)).toEqual(["a", "c"]);
  });
});
```

- [ ] **Step 5: Run the test and watch it fail**

Run: `npx vitest run src/lib/audit.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/audit"`.

- [ ] **Step 6: Write the helper**

Create `src/lib/audit.ts`:

```ts
import type { Prisma } from "@/generated/prisma/client";
import type { AuditAction } from "@/generated/prisma/enums";

/**
 * Anything that can write the table: the Prisma client itself, or an open
 * transaction. Structural, so a call site reads identically inside and outside
 * a `$transaction` and an audit write can never drift out of the transaction
 * whose action it describes.
 */
export type AuditWriter = Pick<Prisma.TransactionClient, "auditEvent">;

/** Field names, counts and references. Never a secret — see the model doc. */
export type AuditDetail = Record<string, string | number | boolean | string[] | null>;

export type AuditInput = {
  action: AuditAction;
  actorId?: string | null;
  buyerId?: string | null;
  subjectUserId?: string | null;
  detail?: AuditDetail;
};

export function audit(writer: AuditWriter, event: AuditInput) {
  return writer.auditEvent.create({
    data: {
      action: event.action,
      actorId: event.actorId ?? null,
      buyerId: event.buyerId ?? null,
      subjectUserId: event.subjectUserId ?? null,
      // `undefined` leaves the column unset; `null` would write a JSON null,
      // which `readDetail` would then have to tell apart from "no detail".
      detail: event.detail ?? undefined,
    },
    select: { id: true },
  });
}

/**
 * Which keys of a patch actually differ from the row it is about to update.
 *
 * A form resubmits every input it holds, so a patch naming eight fields
 * usually changes one. Without this, every edit would be recorded as "edited
 * name, contact, email, phone, address, payment terms, remark" and the trail
 * would say nothing.
 */
export function changedFields(
  patch: Record<string, unknown>,
  current: Record<string, unknown>,
): string[] {
  return Object.keys(patch)
    .filter((key) => patch[key] !== undefined && patch[key] !== current[key])
    .sort();
}
```

- [ ] **Step 7: Run the test and watch it pass**

Run: `npx vitest run src/lib/audit.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `Prisma.TransactionClient` does not resolve, the client was not regenerated — re-run Step 3's `prisma generate`.)

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260913090000_audit_events src/lib/audit.ts src/lib/audit.test.ts
git commit -m "$(cat <<'EOF'
feat(audit): record who changed a customer, and when

LoginAttempt is rate-limit state swept after 24 hours and lastActiveAt is one
timestamp, so neither can answer "who reset this password" or "when did they
last sign in". AuditEvent can, and its foreign keys are SET NULL so the record
of a deletion survives the deletion.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Audit writes in the existing customer actions

**Files:**
- Modify: `src/actions/customers.ts` (`createCustomer`)
- Modify: `src/actions/buyers.ts` (`updateBuyer`)
- Modify: `src/actions/clients.ts` (`inviteBuyerContact`, `setClientAccess`, `updateBuyerContact`)
- Test: `src/actions/customers.test.ts`, `src/actions/buyers.test.ts`, `src/actions/clients.test.ts` (all exist)

**Interfaces:**
- Consumes: `audit`, `changedFields` from `@/lib/audit` (Task 1).
- Produces: nothing new for later tasks; it makes the timeline in Task 9 non-empty.

- [ ] **Step 1: Write the failing tests**

Append to `src/actions/customers.test.ts`, inside the existing `describe("createCustomer")`. The existing `transaction` mock hands the callback `{ buyer: { create }, user: { create } }`, so it needs `auditEvent` too — update the mock in **both** places it is defined (the module-scope `const transaction` and the `beforeEach` re-implementation) to:

```ts
const auditCreate = vi.fn();

const transaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({
    buyer: { create: buyerCreate },
    user: { create: userCreate },
    auditEvent: { create: auditCreate },
  }),
);
```

and add `auditCreate.mockResolvedValue({ id: "evt-1" });` to `beforeEach`. Then the test:

```ts
  it("records the creation against the new buyer, inside the transaction", async () => {
    await createCustomer({ company, contact });
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const data = auditCreate.mock.calls[0][0].data;
    expect(data.action).toBe("CUSTOMER_CREATED");
    expect(data.buyerId).toBe("buyer-1");
    expect(data.actorId).toBe("admin");
    expect(data.detail).toEqual({ withContact: true, name: "Acme Industrial Sdn Bhd" });
    // Never the remark: it is internal, and an audit row is read by more
    // screens than the buyer page is.
    expect(JSON.stringify(data)).not.toContain("Pays late");
  });

  it("writes no audit row when the write it describes rolled back", async () => {
    buyerCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dupe", {
        code: "P2002",
        clientVersion: "7",
        meta: { driverAdapterError: { cause: { constraint: { fields: ["name"] } } } },
      }),
    );
    const result = await createCustomer({ company });
    expect(result.success).toBe(false);
    expect(auditCreate).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/actions/customers.test.ts`
Expected: FAIL — `expected "spy" to be called 1 times, but got 0 times`.

- [ ] **Step 3: Add the write to `createCustomer`**

In `src/actions/customers.ts`: capture the admin, and audit inside the transaction.

```ts
// at the top of the action, replacing `await requireSuperAdmin();`
let admin;
try {
  admin = await requireSuperAdmin();
} catch (cause) {
  if (cause instanceof UnauthorizedError) return { success: false, error: cause.message };
  throw cause;
}
```

Inside the existing `prisma.$transaction(async (tx) => { … })`, after the buyer is created and before each `return`:

```ts
    const buyer = await tx.buyer.create({ data: company, select: { id: true } });
    if (!contact || !passwordHash) {
      await audit(tx, {
        action: "CUSTOMER_CREATED",
        actorId: admin.id,
        buyerId: buyer.id,
        detail: { withContact: false, name: company.name },
      });
      return { buyerId: buyer.id, contact: null };
    }
    const user = await tx.user.create({ /* unchanged */ });
    await audit(tx, {
      action: "CUSTOMER_CREATED",
      actorId: admin.id,
      buyerId: buyer.id,
      detail: { withContact: true, name: company.name },
    });
    return { buyerId: buyer.id, contact: { name: user.name, email: user.email } };
```

Import: `import { audit } from "@/lib/audit";`

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run src/actions/customers.test.ts`
Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 5: Write the failing test for `updateBuyer`**

`src/actions/buyers.test.ts` currently mocks `prisma` as `{ buyer: { update: buyerUpdate } }` alone. Replace that mock and add the two spies:

```ts
const buyerUpdate = vi.fn();
const buyerFindUnique = vi.fn();
const auditCreate = vi.fn();
const requireUser = vi.fn();

// The action now reads the row, then writes the update and its audit row in
// one transaction, so the mock hands the callback the same spies.
const transaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({ buyer: { update: buyerUpdate }, auditEvent: { create: auditCreate } }),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    buyer: { update: buyerUpdate, findUnique: buyerFindUnique },
    auditEvent: { create: auditCreate },
    $transaction: transaction,
  },
}));
```

and in `beforeEach`, after `buyerUpdate.mockResolvedValue({})`:

```ts
  auditCreate.mockResolvedValue({ id: "evt-1" });
  transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ buyer: { update: buyerUpdate }, auditEvent: { create: auditCreate } }),
  );
  // Every pre-existing test in this file calls updateBuyer, which now reads
  // the row first — without this they all fail on "That buyer is gone."
  buyerFindUnique.mockResolvedValue({
    name: "Acme",
    contactName: null,
    email: null,
    phone: null,
    address: null,
    paymentTerms: null,
    remark: null,
  });
```

Then the new tests:

```ts
  it("records only the fields that actually changed", async () => {
    buyerFindUnique.mockResolvedValue({
      id: "buyer-1",
      name: "Acme",
      contactName: "Raj",
      email: "accounts@acme.com",
      phone: "+60 3-1111",
      address: null,
      paymentTerms: "30 days",
      remark: null,
    });
    await updateBuyer("buyer-1", {
      contactName: "Raj",
      phone: "+60 3-2222",
      remark: "Chase on day 25",
    });
    const data = auditCreate.mock.calls[0][0].data;
    expect(data.action).toBe("CUSTOMER_UPDATED");
    expect(data.buyerId).toBe("buyer-1");
    expect(data.detail).toEqual({ fields: ["phone", "remark"] });
    // The remark's text is internal. Its name is not.
    expect(JSON.stringify(data)).not.toContain("Chase on day 25");
  });

  it("writes no audit row when nothing moved", async () => {
    buyerFindUnique.mockResolvedValue({
      id: "buyer-1",
      name: "Acme",
      contactName: "Raj",
      email: null,
      phone: null,
      address: null,
      paymentTerms: null,
      remark: null,
    });
    const result = await updateBuyer("buyer-1", { contactName: "Raj" });
    expect(result.success).toBe(true);
    expect(auditCreate).not.toHaveBeenCalled();
  });
```

- [ ] **Step 6: Run and watch them fail**

Run: `npx vitest run src/actions/buyers.test.ts`
Expected: FAIL — `auditCreate` not called.

- [ ] **Step 7: Make `updateBuyer` read before it writes**

Replace the write block in `src/actions/buyers.ts`:

```ts
  try {
    const current = await prisma.buyer.findUnique({
      where: { id: buyerId },
      select: {
        name: true,
        contactName: true,
        email: true,
        phone: true,
        address: true,
        paymentTerms: true,
        remark: true,
      },
    });
    if (!current) return { success: false, error: "That buyer is gone." };

    const data = { ...rest, ...(name !== undefined ? { name } : {}) };
    const fields = changedFields(data, current);

    await prisma.$transaction(async (tx) => {
      await tx.buyer.update({ where: { id: buyerId }, data });
      // A save that changed nothing is not an edit. Recording it would fill
      // the timeline with "edited" entries naming no field.
      if (fields.length > 0) {
        await audit(tx, {
          action: "CUSTOMER_UPDATED",
          actorId: user.id,
          buyerId,
          detail: { fields },
        });
      }
    });

    revalidatePath(`/buyers/${buyerId}`);
    revalidatePath("/buyers");
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${buyerId}`);
    return { success: true, data: undefined };
  } catch (cause) {
    // …unchanged P2002 branch and console.error
  }
```

Imports: `import { audit, changedFields } from "@/lib/audit";`

- [ ] **Step 8: Run and watch them pass**

Run: `npx vitest run src/actions/buyers.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing tests for the three contact actions**

Append to `src/actions/clients.test.ts`, extending its prisma mock with `auditEvent: { create: auditCreate }` and `$transaction` (callback form, handing the callback an object carrying `user`, `buyer` and `auditEvent`):

```ts
  it("records an invitation against the buyer and the new contact", async () => {
    await inviteBuyerContact({ buyerId: "buyer-1", name: "Siti", email: "siti@acme.com" });
    const data = auditCreate.mock.calls[0][0].data;
    expect(data.action).toBe("CONTACT_INVITED");
    expect(data.buyerId).toBe("buyer-1");
    expect(data.subjectUserId).toBe("c1");
    // The name is stored as well as joined, so the entry still reads properly
    // after the contact is removed and subjectUserId goes null.
    expect(data.detail).toEqual({ name: "Siti" });
  });

  it("never records the temporary password", async () => {
    await inviteBuyerContact({ buyerId: "buyer-1", name: "Siti", email: "siti@acme.com" });
    const password = templateArgs.at(-1)!.password;
    expect(JSON.stringify(auditCreate.mock.calls[0][0])).not.toContain(password);
  });

  it("tells disabling and restoring apart", async () => {
    userFindUnique.mockResolvedValue({
      id: "c1", name: "Siti", role: "CLIENT", buyerId: "buyer-1", disabledAt: null,
    });
    await setClientAccess("c1", false);
    expect(auditCreate.mock.calls[0][0].data.action).toBe("CONTACT_DISABLED");
    auditCreate.mockClear();
    await setClientAccess("c1", true);
    expect(auditCreate.mock.calls[0][0].data.action).toBe("CONTACT_RESTORED");
  });

  it("records which of a contact's fields changed", async () => {
    userFindUnique.mockResolvedValue({
      id: "c1", name: "Siti", username: "siti", phone: null,
      role: "CLIENT", buyerId: "buyer-1",
    });
    await updateBuyerContact("c1", { name: "Siti", username: "siti.ops", phone: "" });
    expect(auditCreate.mock.calls[0][0].data.detail).toEqual({
      name: "Siti",
      fields: ["username"],
    });
  });
```

- [ ] **Step 10: Run and watch them fail**

Run: `npx vitest run src/actions/clients.test.ts`
Expected: FAIL.

- [ ] **Step 11: Add the three writes**

In `src/actions/clients.ts`:

`inviteBuyerContact` — hoist the hash out (it is about to sit inside a transaction) and wrap:

```ts
    const password = temporaryPassword();
    // Bcrypt at cost 12 before the transaction opens: hundreds of
    // milliseconds inside one holds a Neon connection for no reason.
    const passwordHash = await hashPassword(password);

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          username: data.username,
          phone: data.phone,
          role: Role.CLIENT,
          buyerId: buyer.id,
          passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword: true,
        },
        select: { id: true, name: true, email: true },
      });
      await audit(tx, {
        action: "CONTACT_INVITED",
        actorId: user.id,
        buyerId: buyer.id,
        subjectUserId: row.id,
        detail: { name: row.name },
      });
      return row;
    });

    await sendInviteEmail(created, password);
```

`setClientAccess` — the `findUnique` must also select `name`:

```ts
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: contact.id },
        data: {
          disabledAt: enabled ? null : new Date(),
          ...(enabled ? {} : { sessionVersion: { increment: 1 } }),
        },
      });
      await audit(tx, {
        action: enabled ? "CONTACT_RESTORED" : "CONTACT_DISABLED",
        actorId: user.id,
        buyerId: contact.buyerId,
        subjectUserId: contact.id,
        detail: { name: contact.name },
      });
    });
```

`updateBuyerContact` — the `findUnique` selects `name`, `username`, `phone` as well:

```ts
    const fields = changedFields(parsed.data, contact);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: contact.id }, data: parsed.data });
      if (fields.length > 0) {
        await audit(tx, {
          action: "CONTACT_UPDATED",
          actorId: user.id,
          buyerId: contact.buyerId,
          subjectUserId: contact.id,
          detail: { name: parsed.data.name ?? contact.name, fields },
        });
      }
    });
```

Every one of the three also gains the two admin revalidations beside its existing `revalidatePath`:

```ts
    revalidatePath("/admin/customers");
    if (contact.buyerId) revalidatePath(`/admin/customers/${contact.buyerId}`);
```

Imports: `import { audit, changedFields } from "@/lib/audit";`

- [ ] **Step 12: Run the whole suite**

Run: `npm test`
Expected: PASS, every pre-existing test still green.

- [ ] **Step 13: Commit**

```bash
git add src/actions/customers.ts src/actions/customers.test.ts src/actions/buyers.ts src/actions/buyers.test.ts src/actions/clients.ts src/actions/clients.test.ts
git commit -m "$(cat <<'EOF'
feat(audit): every customer mutation records itself in its own transaction

An action can no longer succeed without its audit row or leave one behind
after a rollback. Edits record which fields moved, computed against the row
rather than the submitted form, so "edited phone" means it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Reset a contact's password, and remove one

**Files:**
- Modify: `src/actions/clients.ts`
- Test: `src/actions/clients.test.ts`

**Interfaces:**
- Consumes: `audit` (Task 1), `temporaryPassword`, `hashPassword`, `sendInviteEmail` from `@/lib/client-invites`.
- Produces: `resetClientPassword(contactId): Promise<ActionResult<{ sent: boolean }>>`, `removeBuyerContact(contactId): Promise<ActionResult>`. `resendClientInvite` keeps its name but now returns `ActionResult<{ sent: boolean }>` too. Task 11 consumes all three.

- [ ] **Step 1: Write the failing tests**

Append to `src/actions/clients.test.ts`:

```ts
describe("resetClientPassword", () => {
  beforeEach(() => {
    userFindUnique.mockResolvedValue({
      id: "c1",
      name: "Siti",
      email: "siti@acme.com",
      role: "CLIENT",
      buyerId: "buyer-1",
    });
  });

  it("refuses a member", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireSuperAdmin.mockRejectedValue(new UnauthorizedError("Super admin only."));
    const result = await resetClientPassword("c1");
    expect(result).toEqual({ success: false, error: "Super admin only." });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("refuses an ops user, so this cannot become a back door into staff accounts", async () => {
    userFindUnique.mockResolvedValue({
      id: "u1", name: "Aisha", email: "aisha@lovinghandsportal.com",
      role: "SUPER_ADMIN", buyerId: null,
    });
    const result = await resetClientPassword("u1");
    expect(result).toEqual({ success: false, error: "That contact is gone." });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("forces a change and ends every live session", async () => {
    await resetClientPassword("c1");
    const data = userUpdate.mock.calls[0][0].data;
    expect(data.mustChangePassword).toBe(true);
    expect(data.sessionVersion).toEqual({ increment: 1 });
    expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("emails the password it actually hashed", async () => {
    const { compare } = await import("bcryptjs");
    await resetClientPassword("c1");
    const sent = templateArgs.at(-1)!.password;
    expect(await compare(sent, userUpdate.mock.calls[0][0].data.passwordHash)).toBe(true);
  });

  // sendEmail is documented "Never throws" — it reports failure as
  // { sent: false }. Returning a hard-coded true here is the exact defect
  // Phase 23 found in sendInviteEmail, and the screen believes this value.
  it("reports a failed send honestly, and keeps the reset", async () => {
    sendEmail.mockResolvedValue({ sent: false, error: "Domain not verified" });
    const result = await resetClientPassword("c1");
    expect(result).toEqual({ success: true, data: { sent: false } });
    expect(userUpdate).toHaveBeenCalled();
  });

  it("records PASSWORD_RESET, and never the password", async () => {
    await resetClientPassword("c1");
    const call = auditCreate.mock.calls[0][0];
    expect(call.data.action).toBe("PASSWORD_RESET");
    expect(call.data.subjectUserId).toBe("c1");
    expect(call.data.buyerId).toBe("buyer-1");
    expect(JSON.stringify(call)).not.toContain(templateArgs.at(-1)!.password);
  });

  it("records a resend as a resend, through the same code", async () => {
    await resendClientInvite("c1");
    expect(auditCreate.mock.calls[0][0].data.action).toBe("INVITE_RESENT");
    expect(userUpdate.mock.calls[0][0].data.mustChangePassword).toBe(true);
  });
});

describe("removeBuyerContact", () => {
  it("refuses a contact who placed shop orders, and says how many", async () => {
    userFindUnique.mockResolvedValue({
      id: "c1", name: "Siti", email: "siti@acme.com", role: "CLIENT",
      buyerId: "buyer-1", _count: { webOrdersPlaced: 3 },
    });
    const result = await removeBuyerContact("c1");
    expect(result).toEqual({
      success: false,
      error: "Siti placed 3 shop orders, so their account stays. Disable it instead.",
    });
    expect(userDelete).not.toHaveBeenCalled();
  });

  it("says 'order' when there is one of them", async () => {
    userFindUnique.mockResolvedValue({
      id: "c1", name: "Siti", email: "siti@acme.com", role: "CLIENT",
      buyerId: "buyer-1", _count: { webOrdersPlaced: 1 },
    });
    const result = await removeBuyerContact("c1");
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("placed 1 shop order,");
  });

  it("deletes a contact with no orders, recording the name before the row goes", async () => {
    userFindUnique.mockResolvedValue({
      id: "c1", name: "Siti", email: "siti@acme.com", role: "CLIENT",
      buyerId: "buyer-1", _count: { webOrdersPlaced: 0 },
    });
    const result = await removeBuyerContact("c1");
    expect(result).toEqual({ success: true, data: undefined });
    expect(userDelete).toHaveBeenCalledWith({ where: { id: "c1" } });
    const data = auditCreate.mock.calls[0][0].data;
    expect(data.action).toBe("CONTACT_REMOVED");
    // subjectUserId would be SET NULL the moment the row goes, so the name
    // has to live in the detail or the entry reads "removed (nobody)".
    expect(data.subjectUserId).toBeNull();
    expect(data.detail).toEqual({ name: "Siti", email: "siti@acme.com" });
  });
});
```

The file's prisma mock needs `user.delete: userDelete` added.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/actions/clients.test.ts`
Expected: FAIL — `resetClientPassword is not exported` / `removeBuyerContact is not exported`.

- [ ] **Step 3: Write the two actions**

In `src/actions/clients.ts`, replace the whole of `resendClientInvite` with a shared issuer plus two thin exports:

```ts
/**
 * One implementation behind two names. A reset and a resent invite do exactly
 * the same thing to the row — a fresh temporary password, a forced change and
 * every session ended — and differ only in what the timeline should call it.
 * Two copies of this would drift, and the half that drifted would be the half
 * that leaves a session open.
 */
async function issueTemporaryPassword(
  contactId: string,
  actorId: string,
  action: "PASSWORD_RESET" | "INVITE_RESENT",
): Promise<ActionResult<{ sent: boolean }>> {
  try {
    const contact = await prisma.user.findUnique({
      where: { id: contactId },
      select: { id: true, name: true, email: true, role: true, buyerId: true },
    });
    // A non-CLIENT is refused with the same words as a missing row: this must
    // never become a way to take over an ops account from the customers screen.
    if (!contact || contact.role !== Role.CLIENT) {
      return { success: false, error: "That contact is gone." };
    }

    const password = temporaryPassword();
    const passwordHash = await hashPassword(password);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: contact.id },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword: true,
          // The password they had is gone, so the sessions it opened go too.
          sessionVersion: { increment: 1 },
        },
      });
      await audit(tx, {
        action,
        actorId,
        buyerId: contact.buyerId,
        subjectUserId: contact.id,
        detail: { name: contact.name },
      });
    });

    // After the transaction: the old password has already stopped working, so
    // a Resend outage must not roll that back. The caller is told instead.
    const sent = await sendInviteEmail(contact, password);

    revalidateCustomer(contact.buyerId);
    return { success: true, data: { sent } };
  } catch (cause) {
    console.error("[clients] issueTemporaryPassword", cause);
    return { success: false, error: "We couldn't reset that password." };
  }
}

/** A fresh temporary password for a customer who has lost theirs. */
export async function resetClientPassword(
  contactId: string,
): Promise<ActionResult<{ sent: boolean }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };
  return issueTemporaryPassword(contactId, user.id, "PASSWORD_RESET");
}

/** The same thing, for an invitation that was lost or expired. */
export async function resendClientInvite(
  contactId: string,
): Promise<ActionResult<{ sent: boolean }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };
  return issueTemporaryPassword(contactId, user.id, "INVITE_RESENT");
}
```

And the removal:

```ts
/**
 * Hard delete, unlike `deleteUser`'s soft one — and the difference is the
 * point. An ops user's row stays because uploads, confirmations and stage
 * events are attributed to it. A contact who has placed a shop order is in
 * the same position, so this refuses; one who has not is attached to nothing
 * and leaving a disabled row behind is just clutter.
 */
export async function removeBuyerContact(contactId: string): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    const contact = await prisma.user.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        buyerId: true,
        _count: { select: { webOrdersPlaced: true } },
      },
    });
    if (!contact || contact.role !== Role.CLIENT) {
      return { success: false, error: "That contact is gone." };
    }

    const placed = contact._count.webOrdersPlaced;
    if (placed > 0) {
      return {
        success: false,
        error: `${contact.name} placed ${placed} shop ${
          placed === 1 ? "order" : "orders"
        }, so their account stays. Disable it instead.`,
      };
    }

    await prisma.$transaction(async (tx) => {
      // Before the delete: `subjectUserId` is SET NULL when the row goes, so
      // the name has to be in the detail to survive it.
      await audit(tx, {
        action: "CONTACT_REMOVED",
        actorId: user.id,
        buyerId: contact.buyerId,
        detail: { name: contact.name, email: contact.email },
      });
      await tx.user.delete({ where: { id: contact.id } });
    });

    revalidateCustomer(contact.buyerId);
    return { success: true, data: undefined };
  } catch (cause) {
    // A foreign key we did not think to check is still a refusal, not a crash.
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2003") {
      return {
        success: false,
        error: "Something still references that contact, so their account stays. Disable it instead.",
      };
    }
    console.error("[clients] removeBuyerContact", cause);
    return { success: false, error: "We couldn't remove that contact." };
  }
}
```

Add the shared revalidation helper near `guard()`, and use it in the four existing actions too:

```ts
function revalidateCustomer(buyerId: string | null): void {
  revalidatePath("/buyers");
  revalidatePath("/admin/customers");
  if (!buyerId) return;
  revalidatePath(`/buyers/${buyerId}`);
  revalidatePath(`/admin/customers/${buyerId}`);
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run src/actions/clients.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck — `resendClientInvite`'s return type moved**

Run: `npx tsc --noEmit`
Expected: no errors. `BuyerContactsCard` calls it through `run()`, whose parameter is `() => Promise<{ success: boolean; error?: string }>`; `ActionResult<{ sent: boolean }>` still satisfies that, so the call site compiles unchanged. If it does not, fix the call site — do not widen `run()`.

- [ ] **Step 6: Commit**

```bash
git add src/actions/clients.ts src/actions/clients.test.ts
git commit -m "$(cat <<'EOF'
feat(customers): reset a contact's password, or remove the contact

Reset and resend were always the same operation with different words around
it; they are now literally the same function, so the one that ends every live
session cannot drift from the one that does not. Removal is refused for a
contact who has placed a shop order, because that order is attributed to them.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Delete a customer

**Files:**
- Modify: `src/actions/customers.ts`
- Test: `src/actions/customers.test.ts`

**Interfaces:**
- Consumes: `audit` (Task 1).
- Produces: `deleteBuyer(buyerId: string, confirmName: string): Promise<ActionResult>`. Task 12 consumes it.

- [ ] **Step 1: Write the failing tests**

Append to `src/actions/customers.test.ts`. The prisma mock needs `buyer.findUnique`, `buyer.delete` and `user.deleteMany` alongside what it has; the transaction mock's object gains `buyer: { create, delete }` and `user: { create, deleteMany }`.

```ts
describe("deleteBuyer", () => {
  const clean = {
    id: "buyer-1",
    name: "Kim's Mart",
    _count: { purchaseOrders: 0, webOrders: 0, contacts: 2 },
  };

  beforeEach(() => {
    buyerFindUnique.mockResolvedValue(clean);
  });

  it("refuses a member", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireSuperAdmin.mockRejectedValue(new UnauthorizedError("Super admin only."));
    const result = await deleteBuyer("buyer-1", "Kim's Mart");
    expect(result).toEqual({ success: false, error: "Super admin only." });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("refuses when the typed name does not match", async () => {
    const result = await deleteBuyer("buyer-1", "Kims Mart");
    expect(result).toEqual({
      success: false,
      error: "That name doesn't match. Type the customer's name exactly to delete them.",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("accepts the name with different case and stray spaces", async () => {
    const result = await deleteBuyer("buyer-1", "  kim's mart ");
    expect(result.success).toBe(true);
  });

  it("refuses a customer with purchase orders, naming both counts", async () => {
    buyerFindUnique.mockResolvedValue({
      ...clean,
      _count: { purchaseOrders: 14, webOrders: 2, contacts: 2 },
    });
    const result = await deleteBuyer("buyer-1", "Kim's Mart");
    expect(result).toEqual({
      success: false,
      error:
        "14 purchase orders and 2 shop orders reference this customer, so it can't be deleted. Disable their shop contacts instead.",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("refuses on shop orders alone", async () => {
    buyerFindUnique.mockResolvedValue({
      ...clean,
      _count: { purchaseOrders: 0, webOrders: 1, contacts: 1 },
    });
    const result = await deleteBuyer("buyer-1", "Kim's Mart");
    expect((result as { error: string }).error).toContain("1 shop order references");
  });

  it("deletes the contacts and the buyer in one transaction", async () => {
    const result = await deleteBuyer("buyer-1", "Kim's Mart");
    expect(result).toEqual({ success: true, data: undefined });
    expect(userDeleteMany).toHaveBeenCalledWith({ where: { buyerId: "buyer-1" } });
    expect(buyerDelete).toHaveBeenCalledWith({ where: { id: "buyer-1" } });
  });

  it("records the deletion with the name, detached from the row it is about", async () => {
    await deleteBuyer("buyer-1", "Kim's Mart");
    const data = auditCreate.mock.calls[0][0].data;
    expect(data.action).toBe("CUSTOMER_DELETED");
    // buyerId must be null: the FK is SET NULL, so writing the id here would
    // simply be blanked, and the name is what makes the entry readable.
    expect(data.buyerId).toBeNull();
    expect(data.detail).toEqual({ name: "Kim's Mart", contacts: 2 });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/actions/customers.test.ts`
Expected: FAIL — `deleteBuyer is not exported`.

- [ ] **Step 3: Write the action**

Append to `src/actions/customers.ts`:

```ts
/**
 * A real delete, refused wherever an order points at the row.
 *
 * Postgres would refuse it anyway — `PurchaseOrder.buyerId` and
 * `WebOrder.buyerId` are required with no `onDelete`, so the database
 * restricts. The counts exist to turn that into a sentence naming what is in
 * the way, and to make the button honest before it is pressed.
 */
export async function deleteBuyer(
  buyerId: string,
  confirmName: string,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireSuperAdmin();
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return { success: false, error: cause.message };
    throw cause;
  }

  try {
    const buyer = await prisma.buyer.findUnique({
      where: { id: buyerId },
      select: {
        id: true,
        name: true,
        _count: { select: { purchaseOrders: true, webOrders: true, contacts: true } },
      },
    });
    if (!buyer) return { success: false, error: "That customer is gone." };

    if (buyer.name.trim().toLowerCase() !== confirmName.trim().toLowerCase()) {
      return {
        success: false,
        error: "That name doesn't match. Type the customer's name exactly to delete them.",
      };
    }

    const { purchaseOrders, webOrders, contacts } = buyer._count;
    if (purchaseOrders > 0 || webOrders > 0) {
      return { success: false, error: blockedMessage(purchaseOrders, webOrders) };
    }

    await prisma.$transaction(async (tx) => {
      // First, and with `buyerId: null`: the foreign key is SET NULL, so an id
      // written here would be blanked by the delete two lines below it.
      await audit(tx, {
        action: "CUSTOMER_DELETED",
        actorId: admin.id,
        detail: { name: buyer.name, contacts },
      });
      await tx.user.deleteMany({ where: { buyerId: buyer.id } });
      await tx.buyer.delete({ where: { id: buyer.id } });
    });

    revalidatePath("/buyers");
    revalidatePath("/admin/customers");
    return { success: true, data: undefined };
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2003") {
      return {
        success: false,
        error: "Something still references this customer, so it can't be deleted.",
      };
    }
    console.error("[customers] deleteBuyer", cause);
    return { success: false, error: "We couldn't delete that customer." };
  }
}

/** "14 purchase orders and 2 shop orders reference this customer, so…" */
function blockedMessage(purchaseOrders: number, webOrders: number): string {
  const parts: string[] = [];
  if (purchaseOrders > 0) {
    parts.push(`${purchaseOrders} purchase order${purchaseOrders === 1 ? "" : "s"}`);
  }
  if (webOrders > 0) {
    parts.push(`${webOrders} shop order${webOrders === 1 ? "" : "s"}`);
  }
  const subject = parts.join(" and ");
  const verb = purchaseOrders + webOrders === 1 ? "references" : "reference";
  return `${subject} ${verb} this customer, so it can't be deleted. Disable their shop contacts instead.`;
}
```

`Buyer` has no `contacts` count today only because nothing asked for one — `contacts` is already a relation on the model, so `_count` accepts it with no schema change.

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run src/actions/customers.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/actions/customers.ts src/actions/customers.test.ts
git commit -m "$(cat <<'EOF'
feat(customers): delete a customer, refused wherever an order points at it

Postgres restricts these foreign keys already; this turns that into a sentence
naming what is in the way, and disables the button before it is pressed. The
record of the deletion carries the name and no buyer id, because the id would
be blanked by the delete it describes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: A customer's sign-ins become durable history

**Files:**
- Create: `src/lib/client-sign-in.ts`
- Test: `src/lib/client-sign-in.test.ts`
- Modify: `src/lib/auth.ts` (inside `authorize`, after `recordLoginAttempt`)

**Interfaces:**
- Consumes: `audit` (Task 1).
- Produces: `recordClientSignIn(user: { id, role, buyerId }): Promise<void>`. Task 9's timeline reads the rows it writes.

- [ ] **Step 1: Write the failing test**

Create `src/lib/client-sign-in.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { auditEvent: { create } } }));

const { recordClientSignIn } = await import("@/lib/client-sign-in");

beforeEach(() => {
  vi.resetAllMocks();
  create.mockResolvedValue({ id: "evt-1" });
});

describe("recordClientSignIn", () => {
  it("records a client's sign-in against their own buyer", async () => {
    await recordClientSignIn({ id: "c1", role: "CLIENT", buyerId: "buyer-1" });
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: "SIGNED_IN",
      actorId: "c1",
      buyerId: "buyer-1",
      subjectUserId: null,
    });
  });

  // This is a customer account trail, not staff surveillance, and nothing in
  // the spec asked for one. Recording ops sign-ins would also grow the table
  // by every member's every sign-in for a view nobody can read.
  it("records nothing for ops staff", async () => {
    await recordClientSignIn({ id: "u1", role: "MEMBER", buyerId: null });
    await recordClientSignIn({ id: "u2", role: "SUPER_ADMIN", buyerId: null });
    expect(create).not.toHaveBeenCalled();
  });

  it("records nothing for a CLIENT with no buyer, which the CHECK forbids anyway", async () => {
    await recordClientSignIn({ id: "c1", role: "CLIENT", buyerId: null });
    expect(create).not.toHaveBeenCalled();
  });

  // It is called from `authorize`. A write that rejects must never be the
  // reason a correct password is refused.
  it("never rejects, whatever the database does", async () => {
    create.mockRejectedValue(new Error("connection lost"));
    await expect(
      recordClientSignIn({ id: "c1", role: "CLIENT", buyerId: "buyer-1" }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/client-sign-in.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/client-sign-in"`.

- [ ] **Step 3: Write the module**

Create `src/lib/client-sign-in.ts`:

```ts
import { Role } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

/**
 * One `SIGNED_IN` row per successful customer sign-in.
 *
 * This is the only durable record of it. `LoginAttempt` is rate-limit state
 * and is swept after 24 hours (`src/lib/rate-limit.ts`); `User.lastActiveAt`
 * is a single timestamp that the next sign-in overwrites.
 *
 * Its own module rather than a function inside `auth.ts` so it can be tested
 * without standing up NextAuth, and so the failure rule below is visible on
 * its own: this is called from `authorize`, where a rejected promise would
 * turn a correct password into a refused sign-in.
 */
export async function recordClientSignIn(user: {
  id: string;
  role: Role;
  buyerId: string | null;
}): Promise<void> {
  if (user.role !== Role.CLIENT || !user.buyerId) return;
  try {
    await audit(prisma, {
      action: "SIGNED_IN",
      actorId: user.id,
      buyerId: user.buyerId,
    });
  } catch (cause) {
    console.error("[auth] could not record a client sign-in", cause);
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/client-sign-in.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Call it from `authorize`**

In `src/lib/auth.ts`, inside the Credentials provider's `authorize`, between `if (!ok) return null;` and the `return { id: … }`:

```ts
        await recordLoginAttempt(email, ip, ok);
        if (!ok) return null;

        // Not awaited: the sign-in does not depend on it, and the function
        // swallows its own failures. Same treatment as `touchLastActive`.
        void recordClientSignIn({
          id: user!.id,
          role: user!.role,
          buyerId: user!.buyerId,
        });

        return {
```

Import: `import { recordClientSignIn } from "@/lib/client-sign-in";`

- [ ] **Step 6: Verify the auth suite is untouched**

Run: `npx vitest run src/lib/auth.signIn.test.ts src/lib/auth-guards.test.ts`
Expected: PASS — these cover `resolveGoogleSignIn` and the guards, neither of which this touches.

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/client-sign-in.ts src/lib/client-sign-in.test.ts src/lib/auth.ts
git commit -m "$(cat <<'EOF'
feat(audit): a customer's sign-ins are recorded where they can be read later

LoginAttempt is swept after 24 hours, so it can show failed attempts and
nothing else. Successful client sign-ins now land in AuditEvent, written
fire-and-forget from authorize so a failed write can never refuse a correct
password. Ops sign-ins are deliberately not recorded.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The customers query

**Files:**
- Create: `src/lib/queries/admin-customers.ts`
- Test: `src/lib/queries/admin-customers.test.ts`

**Interfaces:**
- Produces: `CustomerRow`, `CUSTOMER_SORT_KEYS`, `CustomerSortKey`, `listCustomers()`, `selectCustomers(rows, { q, sort })`, `loginsLabel(row)`. Tasks 7 and 12 consume them.

- [ ] **Step 1: Write the failing test**

Create `src/lib/queries/admin-customers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  loginsLabel,
  selectCustomers,
  type CustomerRow,
} from "@/lib/queries/admin-customers";

const row = (over: Partial<CustomerRow>): CustomerRow => ({
  id: "b1",
  name: "Acme Industrial Sdn Bhd",
  contactName: "Raj",
  contactNames: ["Siti"],
  contactEmails: ["siti@acme.com"],
  active: 1,
  invited: 0,
  disabled: 0,
  lastActiveAt: "2026-09-10T02:00:00.000Z",
  orders: 4,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("loginsLabel", () => {
  it("names each kind it has, and only those", () => {
    expect(loginsLabel({ active: 2, invited: 1, disabled: 0 })).toBe("2 active · 1 invited");
    expect(loginsLabel({ active: 0, invited: 0, disabled: 3 })).toBe("3 disabled");
  });

  it("says None rather than an empty string", () => {
    expect(loginsLabel({ active: 0, invited: 0, disabled: 0 })).toBe("None");
  });
});

describe("selectCustomers", () => {
  const rows = [
    row({ id: "b1", name: "Acme Industrial Sdn Bhd", orders: 4 }),
    row({
      id: "b2",
      name: "Kim's Mart",
      contactName: null,
      contactNames: [],
      contactEmails: [],
      active: 0,
      lastActiveAt: null,
      orders: 12,
    }),
    row({
      id: "b3",
      name: "Northwind Traders",
      contactName: "Wei",
      contactNames: ["Wei Ling"],
      contactEmails: ["wei@northwind.example"],
      orders: 0,
      lastActiveAt: "2026-09-12T02:00:00.000Z",
    }),
  ];
  const sort = { key: "name", dir: "asc" } as const;

  it("matches the company name, case-insensitively", () => {
    const found = selectCustomers(rows, { q: "kim", sort });
    expect(found.map((r) => r.id)).toEqual(["b2"]);
  });

  // A super admin looking for a customer usually has the person's email, not
  // the company's registered name.
  it("matches a contact's name or email", () => {
    expect(selectCustomers(rows, { q: "wei@northwind", sort }).map((r) => r.id)).toEqual(["b3"]);
    expect(selectCustomers(rows, { q: "siti", sort }).map((r) => r.id)).toEqual(["b1"]);
  });

  it("sorts by orders descending", () => {
    const sorted = selectCustomers(rows, { sort: { key: "orders", dir: "desc" } });
    expect(sorted.map((r) => r.id)).toEqual(["b2", "b1", "b3"]);
  });

  // "Never" has to sort as older than any real timestamp, not as 1970 in the
  // middle of the list or as NaN at an arbitrary end.
  it("sorts a customer who has never signed in to the bottom of Last active, descending", () => {
    const sorted = selectCustomers(rows, { sort: { key: "lastActiveAt", dir: "desc" } });
    expect(sorted.map((r) => r.id)).toEqual(["b3", "b1", "b2"]);
  });

  it("leaves the input array alone", () => {
    const before = rows.map((r) => r.id);
    selectCustomers(rows, { sort: { key: "orders", dir: "desc" } });
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/queries/admin-customers.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/queries/admin-customers"`.

- [ ] **Step 3: Write the query module**

Create `src/lib/queries/admin-customers.ts`:

```ts
import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export type CustomerRow = {
  id: string;
  name: string;
  contactName: string | null;
  /** Their shop contacts, for search only — the table shows counts. */
  contactNames: string[];
  contactEmails: string[];
  active: number;
  invited: number;
  disabled: number;
  lastActiveAt: string | null;
  /** Purchase orders and shop orders together: "does anything reference them". */
  orders: number;
  createdAt: string;
};

export const CUSTOMER_SORT_KEYS = [
  "name",
  "lastActiveAt",
  "orders",
  "createdAt",
] as const;

export type CustomerSortKey = (typeof CUSTOMER_SORT_KEYS)[number];

/**
 * Deliberately not `listBuyers` (`src/lib/queries/buyers.ts`): that one
 * computes reorder signals, churn risk and a range comparison, cost 2.1s
 * before it was trimmed, and answers "who should we chase". This answers
 * "which account am I managing", which needs counts and a timestamp.
 */
export async function listCustomers(): Promise<CustomerRow[]> {
  const buyers = await prisma.buyer.findMany({
    select: {
      id: true,
      name: true,
      contactName: true,
      createdAt: true,
      _count: { select: { purchaseOrders: true, webOrders: true } },
      contacts: {
        where: { role: Role.CLIENT },
        select: {
          name: true,
          email: true,
          disabledAt: true,
          mustChangePassword: true,
          lastActiveAt: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return buyers.map((buyer) => {
    const seen = buyer.contacts
      .map((contact) => contact.lastActiveAt?.getTime())
      .filter((time): time is number => time !== undefined);

    return {
      id: buyer.id,
      name: buyer.name,
      contactName: buyer.contactName,
      contactNames: buyer.contacts.map((contact) => contact.name),
      contactEmails: buyer.contacts.map((contact) => contact.email),
      active: buyer.contacts.filter((c) => !c.disabledAt && !c.mustChangePassword).length,
      // Invited, not active: they have a temporary password and have never
      // chosen one. Same derivation the contacts card already shows.
      invited: buyer.contacts.filter((c) => !c.disabledAt && c.mustChangePassword).length,
      disabled: buyer.contacts.filter((c) => c.disabledAt).length,
      lastActiveAt: seen.length > 0 ? new Date(Math.max(...seen)).toISOString() : null,
      orders: buyer._count.purchaseOrders + buyer._count.webOrders,
      createdAt: buyer.createdAt.toISOString(),
    };
  });
}

/** "2 active · 1 invited", or "None" — never an empty cell. */
export function loginsLabel(row: Pick<CustomerRow, "active" | "invited" | "disabled">): string {
  const parts: string[] = [];
  if (row.active > 0) parts.push(`${row.active} active`);
  if (row.invited > 0) parts.push(`${row.invited} invited`);
  if (row.disabled > 0) parts.push(`${row.disabled} disabled`);
  return parts.length > 0 ? parts.join(" · ") : "None";
}

/** Search and sort in memory: this is a roster of dozens, not a feed. */
export function selectCustomers(
  rows: CustomerRow[],
  { q, sort }: { q?: string; sort: { key: CustomerSortKey; dir: "asc" | "desc" } },
): CustomerRow[] {
  const needle = q?.trim().toLowerCase();

  const filtered = rows.filter((row) => {
    if (!needle) return true;
    const haystack = [row.name, row.contactName ?? "", ...row.contactNames, ...row.contactEmails];
    return haystack.some((value) => value.toLowerCase().includes(needle));
  });

  const value = (row: CustomerRow): string | number => {
    switch (sort.key) {
      case "name":
        return row.name.toLowerCase();
      case "lastActiveAt":
        // 0, so "Never" sorts as older than every real timestamp rather than
        // landing arbitrarily as NaN.
        return row.lastActiveAt ? Date.parse(row.lastActiveAt) : 0;
      case "orders":
        return row.orders;
      case "createdAt":
        return Date.parse(row.createdAt);
    }
  };

  return [...filtered].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const comparison =
      typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right)
        : Number(left) - Number(right);
    return sort.dir === "asc" ? comparison : -comparison;
  });
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/queries/admin-customers.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/admin-customers.ts src/lib/queries/admin-customers.test.ts
git commit -m "$(cat <<'EOF'
feat(admin): a lean roster query for managing customers

listBuyers answers "who should we chase" and pays for reorder signals and a
range comparison to do it. This answers "which account am I managing", so it
reads counts and one timestamp.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The Customers tab and its table

**Files:**
- Create: `src/components/admin/AdminNav.tsx`
- Create: `src/components/admin/CustomersTable.tsx`
- Create: `src/app/(admin)/admin/customers/page.tsx`
- Create: `src/app/(admin)/admin/customers/loading.tsx`
- Modify: `src/app/(admin)/layout.tsx`

**Interfaces:**
- Consumes: `listCustomers`, `selectCustomers`, `loginsLabel`, `CUSTOMER_SORT_KEYS` (Task 6); `DataTable`/`Column` from `@/components/portal/DataTable`; `useTableSort`, `useUrlNavigation`; `parseSort`, `firstParam` from `@/lib/queries/pagination`.
- Produces: the `/admin/customers` route Tasks 8 and 12 link to.

- [ ] **Step 1: Write the nav**

Create `src/components/admin/AdminNav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkSpinner } from "@/components/portal/LinkSpinner";

const TABS = [
  { href: "/admin", label: "Users" },
  { href: "/admin/customers", label: "Customers" },
] as const;

/**
 * Two rooms in the admin shell. `/admin` matches exactly — a prefix match
 * would light both tabs on every customers page.
 */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="mb-lg flex gap-xs border-b border-hairline">
      {TABS.map((tab) => {
        const active =
          tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px inline-flex min-h-control-md items-center gap-xxs border-b-2 px-sm text-[length:var(--text-body-sm)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              active
                ? "border-ink font-medium text-ink"
                : "border-transparent text-ink-secondary hover:text-ink"
            }`}
          >
            <LinkSpinner />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Render it from the layout**

In `src/app/(admin)/layout.tsx`, inside `<main>`, above `{children}`:

```tsx
          <main className="mx-auto w-full max-w-[var(--container-page)] p-xl">
            <AdminNav />
            {children}
          </main>
```

Import: `import { AdminNav } from "@/components/admin/AdminNav";`

- [ ] **Step 3: Write the table**

Create `src/components/admin/CustomersTable.tsx`:

```tsx
"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { DataTable, type Column } from "@/components/portal/DataTable";
import { Input } from "@/components/ui/input";
import { useTableSort } from "@/hooks/useTableSort";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";
import { formatDate, formatDateTime } from "@/lib/dates";
import { loginsLabel, type CustomerRow } from "@/lib/queries/admin-customers";
import type { SortDirection } from "@/lib/queries/pagination";

export function CustomersTable({
  customers,
  sort,
}: {
  customers: CustomerRow[];
  sort: { key: string; dir: SortDirection };
}) {
  const onSortChange = useTableSort();
  const { replace } = useUrlNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const write = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  };

  const columns: Column<CustomerRow>[] = [
    {
      key: "name",
      header: "Customer",
      cell: (row) => (
        <span className="block min-w-0">
          <span title={row.name} className="block truncate font-medium text-ink">
            {row.name}
          </span>
          {row.contactName ? (
            <span
              title={row.contactName}
              className="block truncate text-[length:var(--text-caption)] text-ink-tertiary"
            >
              {row.contactName}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "logins",
      header: "Shop logins",
      sortable: false,
      cell: (row) =>
        row.active + row.invited + row.disabled === 0 ? (
          <span className="text-ink-tertiary">None</span>
        ) : (
          loginsLabel(row)
        ),
    },
    {
      key: "lastActiveAt",
      header: "Last active",
      defaultDir: "desc",
      mobileHidden: true,
      cell: (row) =>
        row.lastActiveAt ? (
          formatDateTime(row.lastActiveAt)
        ) : (
          <span className="text-ink-tertiary">Never</span>
        ),
    },
    {
      key: "orders",
      header: "Orders",
      align: "right",
      defaultDir: "desc",
      cell: (row) => row.orders,
    },
    {
      key: "createdAt",
      header: "Since",
      defaultDir: "desc",
      mobileHidden: true,
      cell: (row) => formatDate(row.createdAt),
    },
  ];

  return (
    <>
      <div className="mb-sm flex flex-wrap items-center gap-sm">
        <Input
          aria-label="Search customers"
          placeholder="Company, contact or email…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            write(event.target.value);
          }}
          className="h-control-md w-64 sm:h-control-sm"
        />
      </div>

      <DataTable
        columns={columns}
        rows={customers}
        sort={sort}
        onSortChange={onSortChange}
        rowHref={(row) => `/admin/customers/${row.id}`}
        emptyText="No customers match."
      />
    </>
  );
}
```

- [ ] **Step 4: Write the page**

Create `src/app/(admin)/admin/customers/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { CustomersTable } from "@/components/admin/CustomersTable";
import { LinkSpinner } from "@/components/portal/LinkSpinner";
import { Button } from "@/components/ui/button";
import {
  CUSTOMER_SORT_KEYS,
  listCustomers,
  selectCustomers,
} from "@/lib/queries/admin-customers";
import { firstParam, parseSort, type SearchParams } from "@/lib/queries/pagination";

export const metadata: Metadata = { title: "Customers · Loving Hands Portal" };
export const dynamic = "force-dynamic";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const customers = await listCustomers();

  const q = firstParam(params, "q")?.trim() || undefined;
  const sort = parseSort(params, CUSTOMER_SORT_KEYS, { key: "name", dir: "asc" });
  const rows = selectCustomers(customers, { q, sort });

  return (
    <>
      <div className="mb-lg flex flex-wrap items-end justify-between gap-md">
        <div>
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Directory
          </p>
          <h1 className="font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink">
            Customers
          </h1>
        </div>
        {/* The one action this page is for, so it is the ink pill and it is
            alone. A real anchor, so cmd-click opens a tab. */}
        <Button asChild>
          <Link href="/admin/customers/new">
            <LinkSpinner />
            New customer
          </Link>
        </Button>
      </div>

      {customers.length === 0 ? (
        <p className="text-[length:var(--text-body-md)] text-ink-tertiary">
          No customers yet.{" "}
          <Link
            href="/admin/customers/new"
            className="text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Create the first one.
          </Link>
        </p>
      ) : (
        <CustomersTable customers={rows} sort={sort} />
      )}
    </>
  );
}
```

- [ ] **Step 5: Write the skeleton**

Create `src/app/(admin)/admin/customers/loading.tsx`:

```tsx
import {
  ControlsSkeleton,
  HeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/portal/Skeletons";

export default function AdminCustomersLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <ControlsSkeleton />
      <TableSkeleton rows={8} columns={5} />
    </PageSkeleton>
  );
}
```

- [ ] **Step 6: See it in a browser**

Run `npm run dev`, sign in as a super admin, and open `http://localhost:3000/admin/customers`. Check, and write down what you measured:
1. Both tabs render; **Customers** carries `aria-current="page"` here and **Users** carries it on `/admin` (read the attribute, do not judge by the underline).
2. The table lists every buyer. Cross-check the row count against `prisma.buyer.count()`.
3. Typing a contact's email in the search box narrows to that customer, and the URL carries `?q=`.
4. Clicking **Orders** sorts by it and the URL carries `?sort=orders&dir=desc`.
5. A row click lands on `/admin/customers/<id>` (a 404 until Task 12 — that is expected here; confirm the URL, not the page).

- [ ] **Step 7: Typecheck, lint and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors; no new warnings.

```bash
git add src/components/admin/AdminNav.tsx src/components/admin/CustomersTable.tsx "src/app/(admin)/admin/customers/page.tsx" "src/app/(admin)/admin/customers/loading.tsx" "src/app/(admin)/layout.tsx"
git commit -m "$(cat <<'EOF'
feat(admin): a Customers section, with New customer as its only CTA

Creating a customer was a secondary pill beside Upload PO on a page whose job
is analytics. Here it is the ink pill and the reason the page exists.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The create route, and promoting the button on `/buyers`

**Files:**
- Create: `src/app/(admin)/admin/customers/new/page.tsx`
- Create: `src/app/(admin)/admin/customers/new/loading.tsx`
- Modify: `src/components/buyers/CustomerForm.tsx`
- Modify: `src/app/(portal)/buyers/new/page.tsx`
- Modify: `src/components/portal/UploadPoButton.tsx`
- Modify: `src/app/(portal)/buyers/page.tsx:62-70`

**Interfaces:**
- Consumes: `createCustomer` (unchanged signature), the `/admin/customers` route (Task 7).
- Produces: `CustomerForm` now **requires** `afterCreate: string`.

- [ ] **Step 1: Give `CustomerForm` somewhere to land**

In `src/components/buyers/CustomerForm.tsx`:

```tsx
/**
 * …existing doc comment…
 *
 * `afterCreate` is required and has no default: the same form is reached from
 * the portal and from the admin room, and landing a super admin back in the
 * wrong one is the kind of thing a default quietly does forever.
 */
export function CustomerForm({ afterCreate }: { afterCreate: string }) {
```

and at the end of `submit`:

```tsx
    push(`${afterCreate}/${result.data.buyerId}`);
```

- [ ] **Step 2: Pass it from the portal route**

In `src/app/(portal)/buyers/new/page.tsx`, change `<CustomerForm />` to `<CustomerForm afterCreate="/buyers" />`.

- [ ] **Step 3: Add the admin route**

Create `src/app/(admin)/admin/customers/new/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { CustomerForm } from "@/components/buyers/CustomerForm";

export const metadata: Metadata = { title: "New customer · Loving Hands Portal" };
export const dynamic = "force-dynamic";

export default function NewAdminCustomerPage() {
  return (
    <>
      <Link
        href="/admin/customers"
        className="mb-md inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
      >
        ‹ Customers
      </Link>
      <CustomerForm afterCreate="/admin/customers" />
    </>
  );
}
```

Create `src/app/(admin)/admin/customers/new/loading.tsx`:

```tsx
import { HeaderSkeleton, PageSkeleton, Shimmer } from "@/components/portal/Skeletons";

export default function NewAdminCustomerLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton action={false} />
      <Shimmer className="mb-lg h-64 rounded-lg" />
      <Shimmer className="mb-lg h-64 rounded-lg" />
    </PageSkeleton>
  );
}
```

- [ ] **Step 4: Let `UploadPoButton` step aside**

In `src/components/portal/UploadPoButton.tsx`:

```tsx
export function UploadPoButton({
  buyerId,
  variant,
}: {
  buyerId?: string;
  /**
   * Secondary on a page where creating a customer is the primary action.
   * Upload PO is the portal's default primary everywhere else.
   */
  variant?: "secondary";
}) {
  return (
    <Button asChild variant={variant}>
```

- [ ] **Step 5: Promote New customer on `/buyers`**

In `src/app/(portal)/buyers/page.tsx`, replace the `action` block:

```tsx
        action={
          <div className="flex flex-wrap gap-xs">
            {user?.role === Role.SUPER_ADMIN ? (
              <>
                {/* A real anchor, not a router push: cmd-click opens a tab for
                    free, the reasoning /products/new already recorded. */}
                <Button asChild>
                  <Link href="/buyers/new">
                    <LinkSpinner />
                    New customer
                  </Link>
                </Button>
                {/* Two primaries would be no primary. A member sees Upload PO
                    as the page's only action and it stays primary for them. */}
                <UploadPoButton variant="secondary" />
              </>
            ) : (
              <UploadPoButton />
            )}
          </div>
        }
```

- [ ] **Step 6: Check both routes in the browser**

With `npm run dev` running and signed in as a super admin:
1. `/admin/customers/new` renders the form; creating a customer lands on `/admin/customers/<id>` (a 404 until Task 12 — confirm the URL).
2. `/buyers/new` still lands on `/buyers/<id>`. Create one, read the buyer page, then delete the test buyer afterwards (`prisma.buyer.delete`) and note the count before and after.
3. On `/buyers` as a super admin, **New customer** is the dark pill and **Upload PO** is the light one.
4. Sign in as a `MEMBER` (or temporarily set the seeded member's role) and confirm `/buyers` shows **Upload PO** alone, still primary. Revert the role and read it back.

- [ ] **Step 7: Typecheck, lint, test and commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. `tsc` is what proves both `CustomerForm` call sites were updated — `afterCreate` has no default precisely so that it does.

```bash
git add src/components/buyers/CustomerForm.tsx "src/app/(portal)/buyers/new/page.tsx" "src/app/(admin)/admin/customers/new" src/components/portal/UploadPoButton.tsx "src/app/(portal)/buyers/page.tsx"
git commit -m "$(cat <<'EOF'
feat(customers): New customer is a primary action, in both rooms

The same form now lands you back where you started from, which is why
afterCreate is required rather than defaulted. On /buyers a super admin gets
New customer as the ink pill and Upload PO beside it; a member's page is
unchanged.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: The activity timeline's data

**Files:**
- Create: `src/lib/queries/customer-activity.ts`
- Test: `src/lib/queries/customer-activity.test.ts`
- Modify: `src/lib/rate-limit.ts` (export `ATTEMPT_RETENTION_HOURS`)

**Interfaces:**
- Consumes: the `AuditEvent` rows written by Tasks 2–5; `stageLabel` from `@/lib/po-stages`; `formatMYR` from `@/lib/money`.
- Produces: `ActivityEntry`, `ActivityKind`, `ACTIVITY_KINDS`, `ACTIVITY_PAGE_SIZE`, `auditText()`, `readDetail()`, `mergeActivity()`, `loadCustomerActivity(buyerId, { page, kind })`. Tasks 10 and 12 consume them.

- [ ] **Step 1: Export the retention window**

In `src/lib/rate-limit.ts`, change line 12:

```ts
/**
 * How long a login attempt is kept. Exported because the activity timeline
 * prints this number to the reader — "failed sign-ins are kept for 24 hours" —
 * and a caption that disagrees with the sweep is worse than no caption.
 */
export const ATTEMPT_RETENTION_HOURS = 24;
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/queries/customer-activity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  auditText,
  mergeActivity,
  readDetail,
  type ActivityEntry,
} from "@/lib/queries/customer-activity";

const entry = (over: Partial<ActivityEntry>): ActivityEntry => ({
  id: "audit:1",
  kind: "change",
  at: "2026-09-12T02:00:00.000Z",
  text: "Chris Lam edited phone",
  actor: { name: "Chris Lam", image: null },
  href: null,
  ...over,
});

describe("readDetail", () => {
  it("reads a name and a field list out of a Json column", () => {
    expect(readDetail({ name: "Siti", fields: ["phone", "remark"] })).toEqual({
      name: "Siti",
      fields: ["phone", "remark"],
    });
  });

  // The column is Json: anything could be in it, including from a row written
  // by an older version of this code. It must never throw at render time.
  it("survives every shape that is not the one it wants", () => {
    expect(readDetail(null)).toEqual({ name: null, fields: [] });
    expect(readDetail("nonsense")).toEqual({ name: null, fields: [] });
    expect(readDetail({ fields: "phone" })).toEqual({ name: null, fields: [] });
    expect(readDetail({ name: 42, fields: [1, "phone"] })).toEqual({
      name: null,
      fields: ["phone"],
    });
  });
});

describe("auditText", () => {
  const base = { actorName: "Chris Lam", subjectName: "Siti", detail: null as unknown };

  it("names the actor and the contact for each contact action", () => {
    expect(auditText({ ...base, action: "PASSWORD_RESET" })).toBe(
      "Chris Lam reset Siti's password",
    );
    expect(auditText({ ...base, action: "CONTACT_DISABLED" })).toBe(
      "Chris Lam disabled Siti's access",
    );
    expect(auditText({ ...base, action: "CONTACT_RESTORED" })).toBe(
      "Chris Lam restored Siti's access",
    );
    expect(auditText({ ...base, action: "INVITE_RESENT" })).toBe(
      "Chris Lam resent Siti's invitation",
    );
    expect(auditText({ ...base, action: "CONTACT_INVITED" })).toBe("Chris Lam invited Siti");
  });

  it("reads plainly, with field names rather than column names", () => {
    expect(
      auditText({
        ...base,
        action: "CUSTOMER_UPDATED",
        detail: { fields: ["contactName", "paymentTerms"] },
      }),
    ).toBe("Chris Lam edited contact, payment terms");
  });

  it("says who signed in", () => {
    expect(auditText({ ...base, actorName: "Siti", action: "SIGNED_IN" })).toBe("Siti signed in");
  });

  // The contact's row is gone and subjectUserId was SET NULL with it, which is
  // exactly why removeBuyerContact stores the name in the detail.
  it("still names a removed contact, from the detail", () => {
    expect(
      auditText({
        ...base,
        action: "CONTACT_REMOVED",
        subjectName: null,
        detail: { name: "Siti", email: "siti@acme.com" },
      }),
    ).toBe("Chris Lam removed Siti");
  });

  it("does not print 'null' when the actor's row is gone", () => {
    expect(auditText({ ...base, actorName: null, action: "PASSWORD_RESET" })).toBe(
      "Someone reset Siti's password",
    );
  });

  it("says something sensible for an edit that recorded no fields", () => {
    expect(auditText({ ...base, action: "CUSTOMER_UPDATED", detail: {} })).toBe(
      "Chris Lam edited this customer",
    );
  });
});

describe("mergeActivity", () => {
  const lists = [
    [entry({ id: "a:1", at: "2026-09-12T02:00:00.000Z", kind: "change" })],
    [entry({ id: "w:1", at: "2026-09-13T02:00:00.000Z", kind: "shop-order" })],
    [
      entry({ id: "p:1", at: "2026-09-11T02:00:00.000Z", kind: "purchase-order" }),
      entry({ id: "s:1", at: "2026-09-14T02:00:00.000Z", kind: "sign-in" }),
    ],
  ];

  it("interleaves every source, newest first", () => {
    const { entries, total } = mergeActivity(lists, { kind: "all", page: 1, size: 20 });
    expect(entries.map((e) => e.id)).toEqual(["s:1", "w:1", "a:1", "p:1"]);
    expect(total).toBe(4);
  });

  it("filters to one kind, and totals what it kept", () => {
    const { entries, total } = mergeActivity(lists, { kind: "sign-in", page: 1, size: 20 });
    expect(entries.map((e) => e.id)).toEqual(["s:1"]);
    expect(total).toBe(1);
  });

  it("pages", () => {
    const { entries, total } = mergeActivity(lists, { kind: "all", page: 2, size: 2 });
    expect(entries.map((e) => e.id)).toEqual(["a:1", "p:1"]);
    expect(total).toBe(4);
  });

  // A transaction writes its rows with one timestamp, so ties are normal and
  // an unstable order would reshuffle the page on every render.
  it("breaks a tie on id rather than leaving the order to chance", () => {
    const tied = [
      [entry({ id: "b", at: "2026-09-12T02:00:00.000Z" })],
      [entry({ id: "a", at: "2026-09-12T02:00:00.000Z" })],
    ];
    expect(mergeActivity(tied, { kind: "all", page: 1, size: 20 }).entries.map((e) => e.id)).toEqual(
      ["a", "b"],
    );
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/lib/queries/customer-activity.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/queries/customer-activity"`.

- [ ] **Step 4: Write the module**

Create `src/lib/queries/customer-activity.ts`:

```ts
import { PoEventKind, WebOrderStatus } from "@/generated/prisma/enums";
import type { AuditAction } from "@/generated/prisma/enums";
import { formatMYR } from "@/lib/money";
import { stageLabel } from "@/lib/po-stages";
import { prisma } from "@/lib/prisma";
import { ATTEMPT_RETENTION_HOURS } from "@/lib/rate-limit";

export const ACTIVITY_KINDS = ["sign-in", "shop-order", "purchase-order", "change"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_PAGE_SIZE = 20;

export type ActivityEntry = {
  /** `${source}:${rowId}` — unique across sources, and a stable tie-break. */
  id: string;
  kind: ActivityKind;
  /** ISO, because a server component hands these to a client one. */
  at: string;
  /** Composed here: the component renders, it does not decide wording. */
  text: string;
  actor: { name: string; image: string | null } | null;
  href: string | null;
};

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  contactName: "contact",
  email: "email",
  phone: "phone",
  address: "address",
  paymentTerms: "payment terms",
  remark: "remark",
  username: "username",
};

/**
 * `detail` is a Json column, so its shape is a promise the database does not
 * keep — including for rows written by an older version of this code. This
 * narrows it without `any` and without throwing at render time.
 */
export function readDetail(detail: unknown): { name: string | null; fields: string[] } {
  if (typeof detail !== "object" || detail === null) return { name: null, fields: [] };
  const record = detail as Record<string, unknown>;
  return {
    name: typeof record.name === "string" ? record.name : null,
    fields: Array.isArray(record.fields)
      ? record.fields.filter((field): field is string => typeof field === "string")
      : [],
  };
}

export function auditText(event: {
  action: AuditAction;
  actorName: string | null;
  subjectName: string | null;
  detail: unknown;
}): string {
  const { name, fields } = readDetail(event.detail);
  // An ops user's row can be gone (SET NULL). "Someone" is honest and short.
  const actor = event.actorName ?? "Someone";
  const subject = event.subjectName ?? name ?? "a contact";
  const list = fields.map((field) => FIELD_LABELS[field] ?? field).join(", ");

  switch (event.action) {
    case "SIGNED_IN":
      return `${actor} signed in`;
    case "CUSTOMER_CREATED":
      return `${actor} created this customer`;
    case "CUSTOMER_UPDATED":
      return list ? `${actor} edited ${list}` : `${actor} edited this customer`;
    case "CUSTOMER_DELETED":
      return `${actor} deleted ${name ?? "this customer"}`;
    case "CONTACT_INVITED":
      return `${actor} invited ${subject}`;
    case "CONTACT_UPDATED":
      return list ? `${actor} edited ${subject}'s ${list}` : `${actor} edited ${subject}`;
    case "CONTACT_REMOVED":
      return `${actor} removed ${subject}`;
    case "CONTACT_DISABLED":
      return `${actor} disabled ${subject}'s access`;
    case "CONTACT_RESTORED":
      return `${actor} restored ${subject}'s access`;
    case "PASSWORD_RESET":
      return `${actor} reset ${subject}'s password`;
    case "INVITE_RESENT":
      return `${actor} resent ${subject}'s invitation`;
  }
}

/**
 * Sort, filter and page the four sources as one list.
 *
 * ISO strings compare chronologically as strings — same length, same `Z`
 * suffix — so no Date is constructed to order them. Ties break on `id`
 * because a transaction stamps all its rows with one timestamp, and an
 * unstable sort would reshuffle the page on every render.
 */
export function mergeActivity(
  lists: ActivityEntry[][],
  { kind, page, size }: { kind: ActivityKind | "all"; page: number; size: number },
): { entries: ActivityEntry[]; total: number } {
  const all = lists
    .flat()
    .filter((entry) => kind === "all" || entry.kind === kind)
    .sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? 1 : -1));

  return { entries: all.slice((page - 1) * size, page * size), total: all.length };
}

const WEB_ORDER_STATUS: Record<WebOrderStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  CONFIRMED: "Confirmed",
  DECLINED: "Declined",
};

export async function loadCustomerActivity(
  buyerId: string,
  { page, kind }: { page: number; kind: ActivityKind | "all" },
): Promise<{ entries: ActivityEntry[]; total: number; failedWindowHours: number }> {
  // Each source is bounded by what the requested page could possibly need, so
  // a customer with four years of orders does not load four years of rows.
  const take = page * ACTIVITY_PAGE_SIZE;
  const failedSince = new Date(Date.now() - ATTEMPT_RETENTION_HOURS * 3_600_000);

  const [events, webOrders, purchaseOrders, stageEvents, contacts] = await Promise.all([
    prisma.auditEvent.findMany({
      where: { buyerId },
      orderBy: { at: "desc" },
      take,
      select: {
        id: true,
        action: true,
        at: true,
        detail: true,
        actor: { select: { name: true, image: true } },
        subjectUser: { select: { name: true } },
      },
    }),
    prisma.webOrder.findMany({
      where: { buyerId, status: { not: WebOrderStatus.DRAFT } },
      orderBy: { submittedAt: "desc" },
      take,
      select: {
        id: true,
        reference: true,
        status: true,
        submittedAt: true,
        createdAt: true,
        subtotal: true,
        placedBy: { select: { name: true, image: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { buyerId },
      orderBy: { confirmedAt: "desc" },
      take,
      select: {
        id: true,
        poNumber: true,
        total: true,
        confirmedAt: true,
        documentId: true,
        confirmedBy: { select: { name: true, image: true } },
      },
    }),
    prisma.poStageEvent.findMany({
      // `fromStage: null` is the confirm-time ORDER_PLACED event, which the
      // purchase-order entry beside it already says. EDIT events carry an ops
      // note and are not the customer's business.
      where: { kind: PoEventKind.STAGE, fromStage: { not: null }, purchaseOrder: { buyerId } },
      orderBy: { changedAt: "desc" },
      take,
      select: {
        id: true,
        toStage: true,
        changedAt: true,
        changedBy: { select: { name: true, image: true } },
        purchaseOrder: { select: { id: true, poNumber: true } },
      },
    }),
    prisma.user.findMany({ where: { buyerId }, select: { email: true } }),
  ]);

  const emails = contacts.map((contact) => contact.email);
  const failed =
    emails.length > 0
      ? await prisma.loginAttempt.findMany({
          where: { email: { in: emails }, success: false, at: { gte: failedSince } },
          orderBy: { at: "desc" },
          take,
          select: { id: true, email: true, at: true },
        })
      : [];

  const auditEntries: ActivityEntry[] = events.map((event) => ({
    id: `audit:${event.id}`,
    kind: event.action === "SIGNED_IN" ? "sign-in" : "change",
    at: event.at.toISOString(),
    text: auditText({
      action: event.action,
      actorName: event.actor?.name ?? null,
      subjectName: event.subjectUser?.name ?? null,
      detail: event.detail,
    }),
    actor: event.actor ?? null,
    href: null,
  }));

  const webEntries: ActivityEntry[] = webOrders.map((order) => ({
    id: `web:${order.id}`,
    kind: "shop-order",
    at: (order.submittedAt ?? order.createdAt).toISOString(),
    text: `${order.placedBy.name} placed ${order.reference} · ${formatMYR(
      order.subtotal.toString(),
    )} · ${WEB_ORDER_STATUS[order.status]}`,
    actor: order.placedBy,
    href: `/web-orders/${order.id}`,
  }));

  const poEntries: ActivityEntry[] = purchaseOrders.map((order) => ({
    id: `po:${order.id}`,
    kind: "purchase-order",
    at: order.confirmedAt.toISOString(),
    text: `${order.poNumber} confirmed · ${formatMYR(order.total.toString())} · ${
      order.documentId ? `uploaded by ${order.confirmedBy.name}` : "from the shop"
    }`,
    actor: order.confirmedBy,
    href: `/purchase-orders/${order.id}`,
  }));

  const stageEntries: ActivityEntry[] = stageEvents.map((event) => ({
    id: `stage:${event.id}`,
    kind: "purchase-order",
    at: event.changedAt.toISOString(),
    text: `${event.purchaseOrder.poNumber} → ${stageLabel(event.toStage)}${
      event.changedBy ? ` · by ${event.changedBy.name}` : ""
    }`,
    actor: event.changedBy ?? null,
    href: `/purchase-orders/${event.purchaseOrder.id}`,
  }));

  const failedEntries: ActivityEntry[] = failed.map((attempt) => ({
    id: `failed:${attempt.id}`,
    kind: "sign-in",
    at: attempt.at.toISOString(),
    text: `Failed sign-in for ${attempt.email}`,
    actor: null,
    href: null,
  }));

  return {
    ...mergeActivity(
      [auditEntries, webEntries, poEntries, stageEntries, failedEntries],
      { kind, page, size: ACTIVITY_PAGE_SIZE },
    ),
    failedWindowHours: ATTEMPT_RETENTION_HOURS,
  };
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run src/lib/queries/customer-activity.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. `auditText`'s `switch` has no `default` on purpose — adding a member to `AuditAction` later must fail the build here rather than render an empty string.

- [ ] **Step 7: Commit**

```bash
git add src/lib/queries/customer-activity.ts src/lib/queries/customer-activity.test.ts src/lib/rate-limit.ts
git commit -m "$(cat <<'EOF'
feat(admin): one timeline over audit rows, orders, stages and failed sign-ins

Each source is bounded to what the requested page can need, and the merge
breaks ties on id because a transaction stamps all its rows with one time.
The failed-sign-in window is imported from rate-limit rather than retyped, so
the caption cannot outlive the sweep it describes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: The activity card

**Files:**
- Create: `src/components/admin/CustomerActivity.tsx`

**Interfaces:**
- Consumes: `ActivityEntry`, `ActivityKind`, `ACTIVITY_PAGE_SIZE` (Task 9); `SegmentGroup`, `ChoiceButton`, `usePendingChoice`, `TablePagination`, `PersonChip`.
- Produces: `<CustomerActivity entries total kind page failedWindowHours />` for Task 12.

- [ ] **Step 1: Write the component**

Create `src/components/admin/CustomerActivity.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { SegmentGroup } from "@/components/portal/SegmentGroup";
import { TablePagination } from "@/components/portal/TablePagination";
import { PersonChip } from "@/components/ui/person";
import { usePendingChoice } from "@/hooks/usePendingChoice";
import { formatDateTime } from "@/lib/dates";
import {
  ACTIVITY_PAGE_SIZE,
  type ActivityEntry,
  type ActivityKind,
} from "@/lib/queries/customer-activity";

const FILTERS: { value: ActivityKind | "all"; label: string; empty: string }[] = [
  { value: "all", label: "All", empty: "Nothing has happened on this account yet." },
  { value: "sign-in", label: "Sign-ins", empty: "Nobody from this customer has signed in yet." },
  { value: "shop-order", label: "Shop orders", empty: "They have not ordered on the shop." },
  { value: "purchase-order", label: "Purchase orders", empty: "No purchase orders yet." },
  { value: "change", label: "Changes", empty: "Nobody has changed this account yet." },
];

export function CustomerActivity({
  entries,
  total,
  kind,
  page,
  failedWindowHours,
}: {
  entries: ActivityEntry[];
  total: number;
  kind: ActivityKind | "all";
  page: number;
  failedWindowHours: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // `choose` navigates itself, so this hook is the only URL writer here.
  const choice = usePendingChoice<ActivityKind | "all">(kind);

  const hrefFor = (value: ActivityKind | "all") => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("kind");
    else params.set("kind", value);
    // A filter change starts a new list, so it starts at its first page.
    params.delete("page");
    return params.toString() ? `${pathname}?${params.toString()}` : pathname;
  };

  const showsFailures = kind === "all" || kind === "sign-in";

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
        <h2 className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          Activity
        </h2>
        <SegmentGroup label="Filter activity" hideLabel busy={choice.pending}>
          {FILTERS.map((filter) => (
            <ChoiceButton
              key={filter.value}
              look="segment"
              compact
              selected={choice.value === filter.value}
              pending={choice.isPending(filter.value)}
              dimmed={choice.pending && !choice.isPending(filter.value)}
              onClick={() => choice.choose(filter.value, hrefFor(filter.value))}
            >
              {filter.label}
            </ChoiceButton>
          ))}
        </SegmentGroup>
      </div>

      {entries.length === 0 ? (
        <p className="text-[length:var(--text-body-sm)] text-ink-tertiary">
          {FILTERS.find((filter) => filter.value === kind)?.empty}
        </p>
      ) : (
        <ol className="flex flex-col">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-baseline gap-xs border-b border-hairline py-xs last:border-0"
            >
              <span className="shrink-0 font-mono text-[length:var(--text-caption)] text-ink-tertiary">
                {formatDateTime(entry.at)}
              </span>
              {entry.actor ? (
                <PersonChip name={entry.actor.name} image={entry.actor.image} />
              ) : null}
              <span className="min-w-0 flex-1 text-[length:var(--text-body-sm)] text-ink">
                {entry.href ? (
                  <Link
                    href={entry.href}
                    className="text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {entry.text}
                  </Link>
                ) : (
                  entry.text
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      {showsFailures ? (
        // Said, not implied: this list is not the whole story, and the reader
        // would otherwise read an empty stretch as "nothing was tried".
        <p className="mt-sm text-[length:var(--text-caption)] text-ink-tertiary">
          Failed sign-ins are kept for {failedWindowHours} hours. Everything else is kept
          indefinitely.
        </p>
      ) : null}

      {total > ACTIVITY_PAGE_SIZE ? (
        <div className="mt-md">
          <TablePagination
            page={page}
            size={ACTIVITY_PAGE_SIZE}
            total={total}
            sizes={[ACTIVITY_PAGE_SIZE]}
          />
        </div>
      ) : null}
    </section>
  );
}
```

`usePendingChoice` returns `{ value, pending, isPending(value), choose(value, href) }` and `choose` performs the navigation itself (`src/hooks/usePendingChoice.ts:22-42`), which is why there is no second URL writer in this component. `BuyerRangeChips` is a working call site to compare against. Do not change the hook.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors, no new warnings. (It is not rendered yet — Task 12 mounts it.)

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/CustomerActivity.tsx
git commit -m "$(cat <<'EOF'
feat(admin): the activity card

The caption names the retention window because an empty stretch of list would
otherwise read as "nothing was tried" rather than "we no longer know".

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Per-contact actions become a menu

**Files:**
- Modify: `src/components/buyers/BuyerContactsCard.tsx`

**Interfaces:**
- Consumes: `resetClientPassword`, `removeBuyerContact`, `resendClientInvite` (Task 3).
- Produces: the card Task 12 mounts. `/buyers/[id]` picks the same changes up, which is intended.

- [ ] **Step 1: Replace the button row with a menu**

In `src/components/buyers/BuyerContactsCard.tsx`, the `canManage` branch of each contact currently renders three `secondary` buttons side by side. Four controls per row is what already overflowed at 390px in the 2026-09-11 sweep, and Remove and Reset password would make five. Replace that `<div className="flex items-center gap-xxs">` with:

```tsx
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="secondary"
                          aria-label={`Actions for ${contact.name}`}
                          className="size-11 p-0 sm:size-control-sm"
                        >
                          <MoreHorizontal className="size-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setDraft({
                              name: contact.name,
                              username: contact.username ?? "",
                              phone: contact.phone ?? "",
                            });
                            setEditing(contact.id);
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setResetting(contact)}>
                          Reset password
                        </DropdownMenuItem>
                        {/* Only while the invitation is still the way in. */}
                        {contact.invited && !contact.disabledAt ? (
                          <DropdownMenuItem
                            onSelect={() =>
                              void run(`resend-${contact.id}`, async () => {
                                const result = await resendClientInvite(contact.id);
                                if (result.success) {
                                  toast[result.data.sent ? "success" : "warning"](
                                    result.data.sent
                                      ? "Invitation sent again."
                                      : "Password reset, but the email didn't send. Try again.",
                                  );
                                }
                                return result;
                              })
                            }
                          >
                            Resend invitation
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onSelect={() =>
                            void run(`access-${contact.id}`, () =>
                              setClientAccess(contact.id, Boolean(contact.disabledAt)),
                            )
                          }
                        >
                          {contact.disabledAt ? "Restore access" : "Disable access"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setRemoving(contact)}
                        >
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
```

`DropdownMenuItem` already takes `variant="destructive"` (`src/components/ui/dropdown-menu.tsx:63-75`), which resolves to `--color-destructive` → `--color-accent-red`. Use it; never a hex and never a colour class of your own.

New state beside the existing hooks:

```tsx
  const [resetting, setResetting] = useState<BuyerContact | null>(null);
  const [removing, setRemoving] = useState<BuyerContact | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
```

- [ ] **Step 2: Add the two dialogs**

At the end of the component, before the closing `</section>`:

```tsx
      <Dialog open={resetting !== null} onOpenChange={() => setResetting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email a temporary password to {resetting?.email}?</DialogTitle>
            <DialogDescription>
              They will have to choose a new one the next time they sign in, and every
              device they are signed in on will be signed out.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setResetting(null)}>
              Cancel
            </Button>
            <Button
              pending={busy === `reset-${resetting?.id}`}
              onClick={() => {
                const target = resetting;
                if (!target) return;
                void run(`reset-${target.id}`, async () => {
                  const result = await resetClientPassword(target.id);
                  if (result.success) {
                    setResetting(null);
                    // The toast says what happened, not what we hoped: a
                    // Resend failure resolves { sent: false }, and telling
                    // someone to check an inbox that stays empty is the
                    // defect Phase 23 found in exactly this flow.
                    toast[result.data.sent ? "success" : "warning"](
                      result.data.sent
                        ? `Temporary password emailed to ${target.email}`
                        : "Password was reset, but the email didn't send. Try Reset password again.",
                    );
                  }
                  return result;
                });
              }}
            >
              Reset password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removing !== null}
        onOpenChange={() => {
          setRemoving(null);
          setRemoveError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>
              Their shop login is deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {removeError ? (
            <p className="text-[length:var(--text-body-sm)] text-brand-amber">{removeError}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setRemoving(null);
                setRemoveError(null);
              }}
            >
              Cancel
            </Button>
            {/* The refusal is not a dead end: the thing they should do
                instead is a button, not a sentence telling them to go and
                find one. */}
            {removeError ? (
              <Button
                pending={busy === `access-${removing?.id}`}
                onClick={() => {
                  const target = removing;
                  if (!target) return;
                  void run(`access-${target.id}`, async () => {
                    const result = await setClientAccess(target.id, false);
                    if (result.success) {
                      setRemoving(null);
                      setRemoveError(null);
                      toast.success(`${target.name}'s access is disabled.`);
                    }
                    return result;
                  });
                }}
              >
                Disable instead
              </Button>
            ) : (
              <Button
                pending={busy === `remove-${removing?.id}`}
                onClick={() => {
                  const target = removing;
                  if (!target) return;
                  void (async () => {
                    setBusy(`remove-${target.id}`);
                    try {
                      const result = await removeBuyerContact(target.id);
                      if (result.success) {
                        setRemoving(null);
                        toast.success(`${target.name} removed.`);
                        await refresh();
                      } else {
                        // Shown in the dialog, not as a toast: the reason is
                        // the answer to the question the dialog is asking.
                        setRemoveError(result.error);
                      }
                    } catch {
                      toast.error("We couldn't reach the server. Try again.");
                    } finally {
                      setBusy(null);
                    }
                  })();
                }}
              >
                Remove
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

Imports to add:

```tsx
import { MoreHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { removeBuyerContact, resetClientPassword } from "@/actions/clients";
```

- [ ] **Step 3: Check it in the browser on the page that already exists**

`/buyers/[id]` mounts this card today, so it can be driven before Task 12 exists. With `npm run dev` and a super admin session, on a buyer with at least one contact:
1. The menu opens and lists Edit, Reset password, Disable access, Remove — and **Resend invitation** only on a contact whose status reads *Invited*.
2. Reset password on a real test contact: the dialog names their email; confirming toasts; `prisma.user.findUnique` shows `mustChangePassword: true` and `sessionVersion` incremented by exactly 1.
3. Remove on a contact who has placed a shop order: the dialog shows the refusal naming the count, and **Disable instead** appears and works.
4. Remove on a contact with no orders: the row goes; `user.count()` drops by exactly 1.
5. At 390px the menu trigger measures ≥44px (`getBoundingClientRect`), and `document.documentElement.scrollWidth === window.innerWidth`.

Create the test contacts for this yourself and delete them afterwards, counting before and after.

- [ ] **Step 4: Typecheck, lint, test and commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

```bash
git add src/components/buyers/BuyerContactsCard.tsx
git commit -m "$(cat <<'EOF'
feat(customers): reset and remove a shop contact, from one menu

Three buttons per row already crowded 390px; five would not fit at all. The
reset toast reports the send result rather than assuming it, and a refused
removal offers the thing to do instead rather than naming it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: The customer page

**Files:**
- Create: `src/components/admin/DeleteCustomer.tsx`
- Create: `src/app/(admin)/admin/customers/[id]/page.tsx`
- Create: `src/app/(admin)/admin/customers/[id]/loading.tsx`
- Modify: `src/app/(portal)/buyers/[id]/page.tsx` (a "Manage in Admin ›" link)

**Interfaces:**
- Consumes: `deleteBuyer` (Task 4), `loadCustomerActivity` / `ACTIVITY_KINDS` (Task 9), `CustomerActivity` (Task 10), `BuyerContactsCard` (Task 11), `BuyerDetailsCard` and `listBuyerContacts` (both unchanged).

- [ ] **Step 1: Write the danger zone**

Create `src/components/admin/DeleteCustomer.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { deleteBuyer } from "@/actions/customers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

/**
 * The button is disabled with its reason beside it rather than failing on
 * click: the counts are already on the page, so a reader can know it will be
 * refused before they press it.
 */
export function DeleteCustomer({
  buyerId,
  name,
  contacts,
  purchaseOrders,
  webOrders,
}: {
  buyerId: string;
  name: string;
  contacts: number;
  purchaseOrders: number;
  webOrders: number;
}) {
  const { push } = useUrlNavigation();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);

  const blocked = purchaseOrders > 0 || webOrders > 0;
  const parts: string[] = [];
  if (purchaseOrders > 0) {
    parts.push(`${purchaseOrders} purchase order${purchaseOrders === 1 ? "" : "s"}`);
  }
  if (webOrders > 0) parts.push(`${webOrders} shop order${webOrders === 1 ? "" : "s"}`);

  // Case-insensitive and trimmed, the same rule the action applies — a dialog
  // that enables on something the server then rejects is a worse experience
  // than one that never enabled.
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Danger zone
      </p>
      <div className="mt-xs flex flex-wrap items-center justify-between gap-md">
        <p className="min-w-0 flex-1 text-[length:var(--text-body-sm)] text-ink-secondary">
          {blocked
            ? `${parts.join(" and ")} reference this customer, so it can't be deleted. Disable their shop contacts instead.`
            : `This removes ${name}${
                contacts > 0
                  ? ` and its ${contacts} shop contact${contacts === 1 ? "" : "s"}`
                  : ""
              }. There are no orders to lose.`}
        </p>
        <Button
          variant="secondary"
          disabled={blocked}
          // `bg-destructive` is the real token (`--color-destructive` →
          // `--color-accent-red`). There is no `brand-red`.
          className={blocked ? undefined : "bg-destructive text-canvas hover:bg-destructive/90"}
          onClick={() => setOpen(true)}
        >
          Delete customer
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setTyped("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              Type the customer&apos;s name to confirm. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Type the customer's name to confirm"
            placeholder={name}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!matches}
              pending={pending}
              onClick={async () => {
                setPending(true);
                const result = await deleteBuyer(buyerId, typed);
                setPending(false);
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                setOpen(false);
                toast.success(`${name} deleted.`);
                push("/admin/customers");
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
```

The destructive token is `--color-destructive` (`src/app/globals.css:450`, pointing at `--color-accent-red` `#f0382d`), so the classes are `bg-destructive` / `text-destructive`. There is no `brand-red` token — writing one would compile to no colour at all, which is exactly how Phase 12's `text-accent-amber` slipped through.

- [ ] **Step 2: Write the page**

Create `src/app/(admin)/admin/customers/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerActivity } from "@/components/admin/CustomerActivity";
import { DeleteCustomer } from "@/components/admin/DeleteCustomer";
import { BuyerContactsCard } from "@/components/buyers/BuyerContactsCard";
import { BuyerDetailsCard } from "@/components/buyers/BuyerDetailsCard";
import {
  ACTIVITY_KINDS,
  loadCustomerActivity,
  type ActivityKind,
} from "@/lib/queries/customer-activity";
import { listBuyerContacts } from "@/lib/queries/clients";
import { firstParam, parsePagination, type SearchParams } from "@/lib/queries/pagination";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function loadCustomer(id: string) {
  return prisma.buyer.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      contactName: true,
      email: true,
      phone: true,
      address: true,
      paymentTerms: true,
      remark: true,
      _count: { select: { purchaseOrders: true, webOrders: true, contacts: true } },
      purchaseOrders: {
        orderBy: { poDate: "asc" },
        take: 1,
        select: { poDate: true },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const buyer = await prisma.buyer.findUnique({ where: { id }, select: { name: true } });
  return { title: `${buyer?.name ?? "Customer"} · Loving Hands Portal` };
}

export default async function AdminCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const kindParam = firstParam(query, "kind") as ActivityKind;
  const kind = ACTIVITY_KINDS.includes(kindParam) ? kindParam : "all";
  const { page } = parsePagination(query);

  const [buyer, contacts] = await Promise.all([loadCustomer(id), listBuyerContacts(id)]);
  if (!buyer) notFound();

  const activity = await loadCustomerActivity(id, { page, kind });

  return (
    <>
      <Link
        href="/admin/customers"
        className="mb-md inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
      >
        ‹ Customers
      </Link>

      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Customer</p>
      <h1 className="mb-lg font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink">
        {buyer.name}
      </h1>

      <div className="grid gap-lg lg:grid-cols-2">
        <BuyerDetailsCard
          buyer={{
            id: buyer.id,
            name: buyer.name,
            contactName: buyer.contactName,
            email: buyer.email,
            phone: buyer.phone,
            address: buyer.address,
            paymentTerms: buyer.paymentTerms,
            remark: buyer.remark,
            since: buyer.purchaseOrders[0]?.poDate.toISOString() ?? null,
          }}
          // This route is super-admin-only twice over: the layout redirects
          // and the proxy 404s. Anyone rendering this can rename.
          canRename
        />
        <BuyerContactsCard buyerId={buyer.id} contacts={contacts} canManage />
      </div>

      <div className="mt-lg">
        <CustomerActivity
          entries={activity.entries}
          total={activity.total}
          kind={kind}
          page={page}
          failedWindowHours={activity.failedWindowHours}
        />
      </div>

      <div className="mt-lg">
        <DeleteCustomer
          buyerId={buyer.id}
          name={buyer.name}
          contacts={buyer._count.contacts}
          purchaseOrders={buyer._count.purchaseOrders}
          webOrders={buyer._count.webOrders}
        />
      </div>
    </>
  );
}
```

`BuyerDetails` (`src/components/buyers/BuyerDetailsCard.tsx:20-30`) is exactly these nine fields — `id`, `name`, `contactName`, `email`, `phone`, `address`, `paymentTerms`, `remark`, `since` — and `since` is `string | null`, which is why `poDate` is converted above rather than passed as a `Date`.

Create `src/app/(admin)/admin/customers/[id]/loading.tsx`:

```tsx
import { HeaderSkeleton, PageSkeleton, Shimmer } from "@/components/portal/Skeletons";

export default function AdminCustomerLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton action={false} />
      <div className="grid gap-lg lg:grid-cols-2">
        <Shimmer className="h-64 rounded-lg" />
        <Shimmer className="h-64 rounded-lg" />
      </div>
      <Shimmer className="mt-lg h-96 rounded-lg" />
    </PageSkeleton>
  );
}
```

- [ ] **Step 3: Link the portal page to it**

In `src/app/(portal)/buyers/[id]/page.tsx`, inside the existing `<PageHeader … action={…}>`, put the link beside Upload PO for a super admin only:

```tsx
        action={
          <div className="flex flex-wrap items-center gap-xs">
            {user?.role === Role.SUPER_ADMIN ? (
              <Link
                href={`/admin/customers/${id}`}
                className="inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
              >
                Manage in Admin ›
              </Link>
            ) : null}
            <Button asChild>
              {/* Pre-filled to this buyer, so the signal leads into the work. */}
              <Link href={`/upload?buyer=${encodeURIComponent(id)}`}>Upload PO</Link>
            </Button>
          </div>
        }
```

- [ ] **Step 4: Drive the page in the browser**

With `npm run dev` and a super admin session, on a real customer:
1. Both cards render and the page has no `BuyerDetails` type mismatch — `since` shows a date for a buyer with orders and "No orders yet" for one without.
2. The activity card lists entries. Filter to **Changes**, edit the buyer's remark from the Details card, and confirm a new "… edited remark" entry appears with your name — and that the remark's *text* appears nowhere in it.
3. Filter to **Sign-ins**, sign in as a test client on the shop host in another browser context, reload, and confirm a "… signed in" entry. This is the criterion 6 check.
4. `/admin/customers/does-not-exist` returns a genuine 404 — read the status with `curl -o /dev/null -w '%{http_code}'`, not the rendered page.
5. The danger zone on a customer with orders: button disabled, copy naming both counts, and the counts match `prisma.purchaseOrder.count` / `webOrder.count` for that buyer.
6. On `/buyers/<id>`, "Manage in Admin ›" appears for a super admin and lands here.

- [ ] **Step 5: Typecheck, lint, test and commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

```bash
git add src/components/admin/DeleteCustomer.tsx "src/app/(admin)/admin/customers/[id]" "src/app/(portal)/buyers/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(admin): the customer page — details, contacts, activity, danger zone

Delete is disabled with its reason and the real counts beside it, so a reader
knows it will be refused before pressing it rather than after.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Verify the whole thing, sweep it, clean up after it

**Files:**
- Modify: `context/current-feature.md`
- Modify: `docs/specs/25-admin-customers.md` (only if something in it turned out to be wrong)

No new code. This task is the acceptance criteria in §8 of the spec, each one measured and the measurement written down. Record numbers, not adjectives, and say plainly what you did not verify.

- [ ] **Step 1: Count what is in the database before you start**

```bash
npx tsx -e "
import { prisma } from './src/lib/prisma';
const counts = {
  buyers: await prisma.buyer.count(),
  users: await prisma.user.count(),
  clients: await prisma.user.count({ where: { role: 'CLIENT' } }),
  audit: await prisma.auditEvent.count(),
  loginAttempts: await prisma.loginAttempt.count(),
  webOrders: await prisma.webOrder.count(),
};
console.log(counts);
await prisma.\$disconnect();
"
```

Write the numbers down. Every one of them is checked again in Step 7.

- [ ] **Step 2: Criterion 1 — the route is a 404 for anyone else**

Signed in as a `MEMBER` (promote/demote the seeded member and read the role back afterwards), request `/admin/customers` and `/admin/customers/<a real id>`. Read the status off the wire:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -b <cookie jar> http://localhost:3000/admin/customers
```

Expected: the same status `/admin` already returns for a member. Record what it actually is.

- [ ] **Step 3: Criteria 2, 3, 4 — the journey, end to end**

As a super admin, in one sitting:
1. **Create** a customer with a shop login from `/admin/customers/new`. Land on its page. Confirm the row exists and the activity shows "created this customer".
2. **Reset password** on that contact. Record the toast's wording and whether `data.sent` was true; confirm `mustChangePassword` and the incremented `sessionVersion` by reading the row.
3. **Sign in** as that contact on the shop host with the emailed temporary password (read it from the dev server's log or the Resend dashboard), then **reset again** and confirm the *old* password now fails — read the failure off `POST /api/auth/callback/credentials` (`error=CredentialsSignin`), not off the toast.
4. **Remove** a contact with no orders: gone, `user.count()` −1.
5. Place a shop order as a second test contact, then try to remove them: refused with the count, **Disable instead** works.

If the 2026-09-10 `shop.localhost` Chrome issue recurs, use the recorded workaround — a shell-exported `SHOP_HOST`/`SHOP_URL` pointing at `foo.localhost` against the same running server, confirmed identical by `curl` first. Change no file.

- [ ] **Step 4: Criterion 5 — delete, both ways**

1. On a customer with orders, confirm the button is disabled and the copy's counts match the database.
2. On the test customer from Step 3 (delete its shop order first, if it has one): type the name, delete, land on `/admin/customers`. Record `buyer.count()` and `user.count({ role: 'CLIENT' })` before and after — the buyer and its contacts should both drop.
3. Confirm the `CUSTOMER_DELETED` audit row survived with `buyerId: null` and the name in `detail`.

- [ ] **Step 5: Criterion 6 and 7 — the trail is complete and carries no secrets**

```bash
npx tsx -e "
import { prisma } from './src/lib/prisma';
const rows = await prisma.auditEvent.findMany({ orderBy: { at: 'desc' }, take: 40 });
console.log(rows.map((r) => [r.action, r.buyerId, r.subjectUserId, JSON.stringify(r.detail)].join(' | ')).join('\n'));
await prisma.\$disconnect();
"
```

Read every row. Confirm: one row per action taken in Steps 3–4 and no duplicates; no row contains a password, a remark's text, or an email body. Then remove one `audit(...)` call, run `npm test`, and confirm a test fails — the criterion 7 pin is only worth something if it has been seen to catch its own removal. Restore it.

- [ ] **Step 6: Criteria 8 and 9 — nothing leaked, nothing overflows**

```bash
npx vitest run src/lib/shop-viewer.test.ts
git diff main --stat -- src/lib/shop-viewer.ts src/app/\(storefront\)
```

Expected: PASS, and no storefront file in the diff.

Then the sweep. At 390, 768 and 1440, on `/admin/customers`, `/admin/customers/new`, `/admin/customers/<id>` and `/buyers`, measure `document.documentElement.scrollWidth === window.innerWidth`. At 390 on the customer page, list every interactive element under 44px:

```js
[...document.querySelectorAll('a,button,input,select,textarea,[role=button]')]
  .map((el) => ({ tag: el.tagName, label: el.textContent?.trim().slice(0, 30), h: Math.round(el.getBoundingClientRect().height) }))
  .filter((el) => el.h > 0 && el.h < 44)
```

Record the list. Anything on it that is **new** — the contact menu trigger, the danger-zone button, the activity filter chips — is a defect to fix now, not to add to the accepted list. Anything already on the 2026-09-11 accepted list (the `SkipLink`, plain-text row links in `DataTable` card mode, the shared `Switch`) stays recorded as accepted.

- [ ] **Step 7: Clean up, and count again**

Delete every row this task created — test customers, their contacts, their web orders, the `LoginAttempt` rows from Step 3's sign-ins, and the `AuditEvent` rows about them. Re-run Step 1's count script and confirm each number is back where it started, **reading the rows back** rather than trusting a delete's return value. Revert any role you changed and read it back. `git status` must show only the doc files this task edits.

The `AuditEvent` rows are the one judgement call: rows about a deleted test customer carry `buyerId: null` and cannot be traced to it afterwards, so delete them **by id, collected as you go**, not by a wildcard.

- [ ] **Step 8: Write it down**

Update `context/current-feature.md`: move Phase 25 from "in design" to landed, and add a History entry in the established style — what was measured with its numbers, what was found and fixed, what was deliberately left, and an explicit **Not verified** paragraph (production, at minimum: this branch has never been deployed). If anything in `docs/specs/25-admin-customers.md` turned out to be wrong, correct the spec rather than leaving the plan disagreeing with it.

- [ ] **Step 9: Final gate and commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean. Record the test count.

```bash
git add context/current-feature.md docs/specs/25-admin-customers.md
git commit -m "$(cat <<'EOF'
docs: record Phase 25 as built and verified

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10: Stop**

Do **not** merge and do not delete the branch. Phase 24 (`feature/org-settings`) is this branch's parent and is not on `main` yet, so merging this first would drag an unreviewed phase with it. Report what was built, what was measured, and what was not verified, and leave the merge to the user.

---

## Notes for whoever executes this

**The three defects this codebase has produced twice each — watch for them.**

1. **A test that asserts its own mock.** Phase 23 shipped three: `sendEmail.mockRejectedValue` against a function documented never to reject, a hand-built `{ target: [...] }` Prisma error shape the adapter never emits, and a `deletePurchaseOrder({ poId })` call that returned early because the schema wants `id`. Before trusting any test here, watch it fail against the unfixed code. Several steps above say so explicitly; do it for the others too.
2. **A toast that says something the server did not.** `sendEmail` returns `{ sent: false }` rather than throwing. Every place this plan renders a send result reads `data.sent`. `inviteBuyerContact` and the pre-existing "Invite sent." toast still ignore it — that is pre-existing and out of scope, recorded in the spec's §9.
3. **A silent regression behind a type that still compiles.** The generated Prisma client typed `PurchaseOrder.document` as non-null while the schema said otherwise, and `tsc` found none of the call sites. If you change a relation's nullability here, grep the call sites; do not trust the typechecker to find them.

**What this plan does not do.** No archive column, no audit retention or export, no ops sign-in history, no contact email editing, no canvas artboard. Each is refused for a stated reason in `docs/specs/25-admin-customers.md` §9. If one of them seems necessary while building, stop and raise it rather than adding it.

# Phase 41 — Receiving a shop order, and the Source column — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An ops member explicitly *receives* a shop order before anyone can confirm it, the buyer is told when that happens, and the purchase-order list gains a Source column saying whether each row came from the shop or was uploaded by hand.

**Architecture:** One additive migration adds a fifth `WebOrderStatus` value, `RECEIVED`, plus `receivedById`/`receivedAt` on `WebOrder`. A new Server Action `receiveWebOrder` moves an order `SUBMITTED → RECEIVED`; `confirmWebOrder` then requires `RECEIVED`. Eleven existing modules branch on `SUBMITTED` and each must be taught the new state — that is the bulk of the work and the whole of the risk.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Prisma 7 on Neon Postgres, Tailwind v4 (CSS `@theme` config only), Vitest, Resend + `@react-email/components`.

**Spec:** `docs/specs/41-order-receipt-and-source.md` — read it before Task 1. §7 is the checklist this plan's Tasks 6–8 execute.

## Global Constraints

- **TypeScript strict. No `any`** — use `unknown` and narrow. (`context/coding-standard.md`)
- **Tailwind v4: never create `tailwind.config.*`.** All theme config lives in `@theme` in `src/app/globals.css`.
- **No raw hex, no px font size, no arbitrary Tailwind value** (`bg-[#292d34]`, `text-[15px]`) in any component. If a token is missing, add it to `@theme` first. (`context/design-system.md`)
- **Sentence-case labels.** "Receive order", never "Receive Order". (`docs/specs/00-master.md` §4)
- **Server components by default;** `"use client"` only for interactivity. A server component may **not** import a function exported from a `"use client"` module (the Phase 31 `singleGroup` defect).
- **Prisma: `prisma migrate dev` only, never `db push`.** Run `npx prisma migrate status` before committing.
- **Actions return `{ success, data, error }`** and validate input with Zod.
- **`sendEmail` never throws** — it returns `{ sent: boolean }`. A failed send must never read as a failed action.
- **Every email send goes inside `after()`** so it cannot block or fail the action.
- **Commit messages: conventional, no "Generated with Claude".** Ask before committing to `main`; committing to the feature branch as you go is expected.
- **Touch targets ≥ 44px below `sm`.**
- **Branch:** `feature/order-receipt`, cut from `main`.

---

### Task 1: The schema and the migration

**Files:**
- Modify: `prisma/schema.prisma` (enum `WebOrderStatus`, model `WebOrder`, model `User`)
- Create: `prisma/migrations/20260918090000_web_order_received/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `WebOrderStatus.RECEIVED`; `WebOrder.receivedById: string | null`, `WebOrder.receivedAt: Date | null`, relation `WebOrder.receivedBy`; `User.webOrdersReceived`. Every later task depends on these names.

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull && git checkout -b feature/order-receipt
```

- [ ] **Step 2: Add the enum value**

In `prisma/schema.prisma`, replace the `WebOrderStatus` enum:

```prisma
enum WebOrderStatus {
  DRAFT
  SUBMITTED
  /// A person has acknowledged the order. Not yet a purchase order — the
  /// team has not committed to a delivery date. Phase 41.
  RECEIVED
  CONFIRMED
  DECLINED
}
```

- [ ] **Step 3: Add the columns and the relation**

In `model WebOrder`, immediately **above** the existing `reviewedById` line:

```prisma
  /// Who acknowledged the order, and when (Phase 41). Deliberately not
  /// `reviewedBy`: that means *who decided*, and receiving and deciding can
  /// be two different people — collapsing them would make "Received by" lie
  /// the moment a second person confirms.
  receivedById    String?
  receivedBy      User?          @relation("webOrdersReceived", fields: [receivedById], references: [id], onDelete: SetNull)
  receivedAt      DateTime?
```

In `model User`, immediately below `webOrdersReviewed`:

```prisma
  webOrdersReceived  WebOrder[]           @relation("webOrdersReceived")
```

- [ ] **Step 4: Write the migration by hand**

Create `prisma/migrations/20260918090000_web_order_received/migration.sql`:

```sql
-- AlterEnum
-- BEFORE 'CONFIRMED' keeps the enum's sort order matching its lifecycle, which
-- matters to any ORDER BY on the column.
ALTER TYPE "WebOrderStatus" ADD VALUE 'RECEIVED' BEFORE 'CONFIRMED';

-- AlterTable
ALTER TABLE "WebOrder" ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedById" TEXT;

-- AddForeignKey
ALTER TABLE "WebOrder" ADD CONSTRAINT "WebOrder_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Written by hand rather than generated because `prisma migrate dev --create-only` prompts in a way a non-TTY cannot answer and has hung for minutes on this machine before (2026-09-09).

**Nothing in this file may reference the string `'RECEIVED'` except the `ADD VALUE` itself.** Postgres refuses to *use* a newly added enum value in the transaction that adds it, so a CHECK or a DEFAULT spelling it would pass `migrate dev` locally and fail `migrate deploy` in production — the trap Phase 15 hit.

- [ ] **Step 5: Apply it and regenerate**

```bash
timeout 120 npx prisma migrate deploy && npx prisma generate
```

Expected: `1 migration found`, applied; then `Generated Prisma Client`.

- [ ] **Step 6: Verify the column and the value exist in the database**

```bash
npx tsx -e "
import { prisma } from './src/lib/prisma';
const [{ exists }] = await prisma.\$queryRaw\`
  SELECT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'WebOrderStatus' AND e.enumlabel = 'RECEIVED') AS exists\`;
console.log('RECEIVED in enum:', exists);
const cols = await prisma.\$queryRaw\`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'WebOrder' AND column_name IN ('receivedById','receivedAt')\`;
console.log('columns:', cols);
await prisma.\$disconnect();
"
```

Expected: `RECEIVED in enum: true` and both columns listed.

- [ ] **Step 7: Confirm migrations are in sync and the project still builds**

```bash
npx prisma migrate status && npx tsc --noEmit
```

Expected: "Database schema is up to date!" and no type errors.

**If a dev server is running, restart it.** A server started before `prisma generate` keeps the old client and answers "Unknown field `receivedBy`" for every new relation.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260918090000_web_order_received
git commit -m "feat(web-orders): a shop order can be received before it is confirmed

Adds WebOrderStatus.RECEIVED and WebOrder.receivedById/receivedAt. Nothing
reads them yet."
```

---

### Task 2: The buyer's "we've got it" email

**Files:**
- Create: `src/emails/WebOrderReceived.tsx`
- Create: `src/emails/WebOrderReceived.test.tsx`

**Interfaces:**
- Consumes: `Layout`, `ButtonLink`, `Heading`, `Mono`, `Paragraph` from `@/emails/parts` and `@/emails/Layout`.
- Produces: `WebOrderReceived(props: WebOrderReceivedProps)` and `webOrderReceivedSubject(reference: string): string`. `WebOrderReceivedProps = { reference: string; buyerReference: string | null; lineCount: number; total: string; orderUrl: string }`. Task 3 imports both.

- [ ] **Step 1: Write the failing test**

Create `src/emails/WebOrderReceived.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  WebOrderReceived,
  webOrderReceivedSubject,
} from "@/emails/WebOrderReceived";

const html = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    WebOrderReceived({
      reference: "W-2609-00001",
      buyerReference: "ACME-PO-771",
      lineCount: 3,
      total: "RM 1,926.50",
      orderUrl: "https://shop.example.com/orders/w1",
      ...over,
    }),
  );

describe("WebOrderReceived", () => {
  it("names the order, the figures and the buyer's own reference", () => {
    const out = html();
    expect(out).toContain("W-2609-00001");
    expect(out).toContain("ACME-PO-771");
    expect(out).toContain("RM 1,926.50");
    expect(out).toContain("3 lines");
    expect(out).toContain("https://shop.example.com/orders/w1");
  });

  it("omits the buyer's reference when they gave none", () => {
    expect(html({ buyerReference: null })).not.toContain("your reference");
  });

  it("says one line, not 1 lines", () => {
    expect(html({ lineCount: 1 })).toContain("1 line ");
  });

  // The whole point of this mail is that a delivery date does NOT exist yet.
  // Promising one here would contradict the confirmation mail that follows.
  it("promises no delivery date", () => {
    const out = html().toLowerCase();
    expect(out).not.toContain("expect to deliver");
    expect(out).not.toContain("delivery date is");
  });

  it("puts the reference in the subject", () => {
    expect(webOrderReceivedSubject("W-2609-00001")).toBe(
      "We have your order W-2609-00001",
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/emails/WebOrderReceived.test.tsx
```

Expected: FAIL — `Failed to resolve import "@/emails/WebOrderReceived"`.

- [ ] **Step 3: Write the template**

Create `src/emails/WebOrderReceived.tsx`:

```tsx
import { Layout } from "@/emails/Layout";
import { ButtonLink, Heading, Mono, Paragraph } from "@/emails/parts";

export type WebOrderReceivedProps = {
  reference: string;
  buyerReference: string | null;
  lineCount: number;
  total: string;
  orderUrl: string;
};

/**
 * A person on the ops team has picked the order up (Phase 41).
 *
 * The third mail in the sequence — receipt, this, then confirmation. It
 * exists because the gap between "sent" and "confirmed with a date" can last
 * days, and nothing in the product used to say a human had seen the order.
 *
 * It deliberately promises no date: there is none yet, and inventing a
 * "soon" here would be contradicted by the confirmation mail that follows.
 */
export function WebOrderReceived({
  reference,
  buyerReference,
  lineCount,
  total,
  orderUrl,
}: WebOrderReceivedProps) {
  return (
    <Layout>
      <Heading>{`We have your order ${reference}`}</Heading>
      <Paragraph>
        Our team has your order and is working on it. We will confirm it with
        an expected delivery date shortly.
      </Paragraph>
      <Paragraph muted>
        {`${lineCount} line${lineCount === 1 ? "" : "s"} · ${total}`}
        {buyerReference ? " · your reference " : ""}
        {buyerReference ? <Mono>{buyerReference}</Mono> : null}
      </Paragraph>
      <ButtonLink href={orderUrl}>See your order</ButtonLink>
    </Layout>
  );
}

export const webOrderReceivedSubject = (reference: string) =>
  `We have your order ${reference}`;

export default WebOrderReceived;
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run src/emails/WebOrderReceived.test.tsx
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/emails/WebOrderReceived.tsx src/emails/WebOrderReceived.test.tsx
git commit -m "feat(emails): tell the buyer their order has been picked up"
```

---

### Task 3: `receiveWebOrder`

**Files:**
- Modify: `src/actions/web-orders.ts` (add the action; leave `confirmWebOrder` and `declineWebOrder` alone — Task 4 changes those)
- Create: `src/actions/receive-web-order.test.ts`

**Interfaces:**
- Consumes: Task 1's `WebOrderStatus.RECEIVED`, `receivedById`, `receivedAt`; Task 2's `WebOrderReceived`, `webOrderReceivedSubject`.
- Produces: `receiveWebOrder(webOrderId: string): Promise<ActionResult>` — `ActionResult<undefined>`, already exported from this file. Tasks 9 and 11 call it.

- [ ] **Step 1: Write the failing test**

Create `src/actions/receive-web-order.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const webUpdateMany = vi.fn();
const webFindUnique = vi.fn();
const requireUser = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webOrder: { updateMany: webUpdateMany, findUnique: webFindUnique },
  },
}));
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireUser,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://www.example.com", SHOP_URL: "https://shop.example.com" },
}));
const sendEmail = vi.fn().mockResolvedValue({ sent: true });
vi.mock("@/lib/email", () => ({ sendEmail }));
const afterTasks: Promise<unknown>[] = [];
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    afterTasks.push(Promise.resolve(fn()));
  },
}));
const flushAfter = async () => {
  await Promise.all(afterTasks);
  afterTasks.length = 0;
};

const { receiveWebOrder } = await import("@/actions/web-orders");

beforeEach(() => {
  vi.clearAllMocks();
  afterTasks.length = 0;
  requireUser.mockResolvedValue({ id: "u1", name: "Aisha Rahman" });
  webUpdateMany.mockResolvedValue({ count: 1 });
  webFindUnique.mockResolvedValue({
    reference: "W-2609-00001",
    buyerReference: "ACME-PO-771",
    subtotal: { toNumber: () => 1926.5 },
    placedBy: { email: "buyer@example.com" },
    _count: { lines: 3 },
  });
});

describe("receiveWebOrder", () => {
  it("moves a submitted order to RECEIVED and records who and when", async () => {
    const result = await receiveWebOrder("w1");

    expect(result).toEqual({ success: true, data: undefined });
    const call = webUpdateMany.mock.calls[0]![0];
    // Guarded on the status the caller last saw: two people receiving at once
    // cannot both win.
    expect(call.where).toEqual({ id: "w1", status: "SUBMITTED" });
    expect(call.data.status).toBe("RECEIVED");
    expect(call.data.receivedById).toBe("u1");
    expect(call.data.receivedAt).toBeInstanceOf(Date);
  });

  it("refuses an order somebody else already received, and writes nothing else", async () => {
    webUpdateMany.mockResolvedValue({ count: 0 });
    const result = await receiveWebOrder("w1");

    expect(result).toEqual({
      success: false,
      error: "This one has already been received.",
    });
    await flushAfter();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails the buyer, on the shop host", async () => {
    await receiveWebOrder("w1");
    await flushAfter();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0]![0];
    expect(mail.to).toEqual(["buyer@example.com"]);
    expect(mail.subject).toBe("We have your order W-2609-00001");
    // Phase 15: the buyer's session exists on the shop host only.
    expect(JSON.stringify(mail.react.props)).toContain(
      "https://shop.example.com/orders/w1",
    );
  });

  // src/lib/email.ts is documented "never throws" and returns { sent: false }
  // on failure. A missing nudge is not a failed acknowledgement.
  it("still succeeds when the email does not go", async () => {
    sendEmail.mockResolvedValue({ sent: false });
    const result = await receiveWebOrder("w1");
    await flushAfter();
    expect(result.success).toBe(true);
  });

  it("refuses a caller who is not ops staff", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireUser.mockRejectedValue(new UnauthorizedError("not signed in"));
    expect(await receiveWebOrder("w1")).toEqual({
      success: false,
      error: "not signed in",
    });
    expect(webUpdateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/actions/receive-web-order.test.ts
```

Expected: FAIL — `receiveWebOrder is not a function`.

- [ ] **Step 3: Write the action**

In `src/actions/web-orders.ts`, add these imports to the existing import block:

```ts
import {
  WebOrderReceived,
  webOrderReceivedSubject,
} from "@/emails/WebOrderReceived";
import { formatMYR } from "@/lib/money";
```

(If `formatMYR` is already imported there, do not import it twice.)

Then add the action, above `declineWebOrder`:

```ts
/**
 * Acknowledge a shop order (Phase 41).
 *
 * The gap this closes: between the buyer sending an order and the team
 * committing to a delivery date, nothing in the product said a human had
 * seen it. `confirmWebOrder` now requires this to have happened.
 *
 * Any signed-in ops member may receive — this is the queue being worked, not
 * a super-admin act.
 */
export async function receiveWebOrder(
  webOrderId: string,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    // Guarded on the status the caller last saw, the same shape as
    // declineWebOrder and advanceStage.
    const updated = await prisma.webOrder.updateMany({
      where: { id: webOrderId, status: WebOrderStatus.SUBMITTED },
      data: {
        status: WebOrderStatus.RECEIVED,
        receivedById: user.id,
        receivedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      return { success: false, error: "This one has already been received." };
    }

    revalidatePath("/purchase-orders");
    revalidatePath("/");
    revalidatePath(shopPath.orders());

    // Read after the update so the recipient is whoever actually placed it.
    const order = await prisma.webOrder.findUnique({
      where: { id: webOrderId },
      select: {
        reference: true,
        buyerReference: true,
        subtotal: true,
        placedBy: { select: { email: true } },
        _count: { select: { lines: true } },
      },
    });
    if (order) {
      after(async () => {
        await sendEmail({
          to: [order.placedBy.email],
          subject: webOrderReceivedSubject(order.reference),
          react: WebOrderReceived({
            reference: order.reference,
            buyerReference: order.buyerReference,
            lineCount: order._count.lines,
            total: formatMYR(order.subtotal.toNumber()),
            // Phase 15: the buyer's session is host-only, and it is the shop's.
            orderUrl: `${env.SHOP_URL ?? env.APP_URL}/orders/${webOrderId}`,
          }),
        });
      });
    }

    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[web-orders] receiveWebOrder", cause);
    return { success: false, error: "We couldn't receive that order." };
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run src/actions/receive-web-order.test.ts && npx tsc --noEmit
```

Expected: PASS, 5 tests; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/actions/web-orders.ts src/actions/receive-web-order.test.ts
git commit -m "feat(web-orders): receiveWebOrder acknowledges a shop order"
```

---

### Task 4: Confirm requires a received order; decline accepts one

**Files:**
- Modify: `src/actions/web-orders.ts` (`confirmWebOrder` status guard, `declineWebOrder` `where`)
- Modify: `src/actions/confirm-web-order.test.ts`

**Interfaces:**
- Consumes: Task 1's enum value.
- Produces: `confirmWebOrder` rejects a `SUBMITTED` order with the exact string `"Receive this order before confirming it."`; Task 11's UI shows that same sentence.

- [ ] **Step 1: Write the failing tests**

In `src/actions/confirm-web-order.test.ts`, inside the `describe("confirmWebOrder", …)` block, add:

```ts
it("refuses an order nobody has received yet, and says which mistake it is", async () => {
  webFindUnique.mockResolvedValue({
    id: "w1",
    status: "SUBMITTED",
    buyerId: "b1",
    buyerReference: null,
    reference: "W-2609-00001",
    placedBy: { email: "buyer@example.com" },
    _count: { lines: 1 },
  });

  const result = await confirmWebOrder("w1", draft(), {
    deliveryDate: "2026-10-02",
  });

  expect(result).toEqual({
    success: false,
    error: "Receive this order before confirming it.",
  });
  expect(writePurchaseOrder).not.toHaveBeenCalled();
});

it("confirms an order that has been received", async () => {
  webFindUnique.mockResolvedValue({
    id: "w1",
    status: "RECEIVED",
    buyerId: "b1",
    buyerReference: null,
    reference: "W-2609-00001",
    placedBy: { email: "buyer@example.com" },
    _count: { lines: 1 },
  });
  writePurchaseOrder.mockResolvedValue("po1");

  const result = await confirmWebOrder("w1", draft(), {
    deliveryDate: "2026-10-02",
  });

  expect(result.success).toBe(true);
});
```

And inside `describe("declineWebOrder", …)`:

```ts
it("declines an order that has already been received", async () => {
  webUpdateMany.mockResolvedValue({ count: 1 });
  webFindUniqueOuter.mockResolvedValue({
    reference: "W-2609-00001",
    placedBy: { email: "buyer@example.com" },
  });

  const result = await declineWebOrder("w1", { reason: "Out of stock" });

  expect(result.success).toBe(true);
  // An order a person has looked at is exactly the one they may turn down.
  expect(webUpdateMany.mock.calls[0]![0].where).toEqual({
    id: "w1",
    status: { in: ["SUBMITTED", "RECEIVED"] },
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx vitest run src/actions/confirm-web-order.test.ts
```

Expected: FAIL — the confirm test gets the generic `"This one has already been reviewed."`, and the decline test's `where` is `{ id: "w1", status: "SUBMITTED" }`.

- [ ] **Step 3: Change the two guards**

In `confirmWebOrder`, replace:

```ts
      if (order.status !== WebOrderStatus.SUBMITTED) {
        throw new Error("ALREADY_REVIEWED");
      }
```

with:

```ts
      // Two different mistakes, and only one of them is the user's to fix.
      if (order.status === WebOrderStatus.SUBMITTED) {
        throw new Error("NOT_RECEIVED");
      }
      if (order.status !== WebOrderStatus.RECEIVED) {
        throw new Error("ALREADY_REVIEWED");
      }
```

In the same function's `catch`, beside the existing `ALREADY_REVIEWED` branch, add:

```ts
    if (cause instanceof Error && cause.message === "NOT_RECEIVED") {
      return {
        success: false,
        error: "Receive this order before confirming it.",
      };
    }
```

In `declineWebOrder`, change the `where`:

```ts
      where: {
        id: webOrderId,
        status: { in: [WebOrderStatus.SUBMITTED, WebOrderStatus.RECEIVED] },
      },
```

- [ ] **Step 4: Run the whole action suite**

```bash
npx vitest run src/actions/ && npx tsc --noEmit
```

Expected: all pass. If an existing confirm test breaks because its fixture says `status: "SUBMITTED"`, that is the gate working — update that fixture to `"RECEIVED"`, which is now the state a confirmable order is in.

- [ ] **Step 5: Commit**

```bash
git add src/actions/web-orders.ts src/actions/confirm-web-order.test.ts
git commit -m "feat(web-orders): confirming requires a received order"
```

---

### Task 5: Deleting a purchase order clears the received fields

**Files:**
- Modify: `src/actions/purchase-orders.ts` (`deletePurchaseOrder`, the `tx.webOrder.updateMany` near line 608)
- Modify: `src/actions/purchase-orders.test.ts`

**Interfaces:**
- Consumes: Task 1's columns.
- Produces: nothing new.

This is the one `SUBMITTED` site in spec §7 that is a **writer**, not a filter.

- [ ] **Step 1: Write the failing test**

In `src/actions/purchase-orders.test.ts`, inside the `deletePurchaseOrder` describe block:

```ts
it("returns the shop order to the queue with nobody named on it", async () => {
  // …arrange exactly as the neighbouring deletePurchaseOrder tests do…
  await deletePurchaseOrder({ id: "po1" });

  const call = webOrderUpdateMany.mock.calls.at(-1)![0];
  expect(call.where).toEqual({ purchaseOrderId: "po1" });
  // Back to SUBMITTED, not RECEIVED: an order returning to the queue is
  // exactly one that needs a person again. A row in SUBMITTED still naming
  // who received it is a lie.
  expect(call.data).toEqual({
    status: "SUBMITTED",
    purchaseOrderId: null,
    reviewedById: null,
    reviewedAt: null,
    receivedById: null,
    receivedAt: null,
  });
});
```

Use the arrange block from the adjacent delete tests verbatim; if `webOrderUpdateMany` is not yet a mock in that file, add it to the `tx` mock beside the existing `extraction.updateMany`.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/actions/purchase-orders.test.ts -t "returns the shop order to the queue"
```

Expected: FAIL — `data` is missing `receivedById` and `receivedAt`.

- [ ] **Step 3: Add the two fields**

```ts
      await tx.webOrder.updateMany({
        where: { purchaseOrderId: po.id },
        data: {
          status: WebOrderStatus.SUBMITTED,
          purchaseOrderId: null,
          reviewedById: null,
          reviewedAt: null,
          // Phase 41: or the row sits in SUBMITTED still naming who received it.
          receivedById: null,
          receivedAt: null,
        },
      });
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run src/actions/purchase-orders.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions/purchase-orders.ts src/actions/purchase-orders.test.ts
git commit -m "fix(purchase-orders): a deleted order returns to the queue unclaimed"
```

---

### Task 6: The buyer-facing readers

**Files:**
- Modify: `src/lib/queries/web-orders.ts` (`listBuyerOrders`, `loadBuyerOrder`, the `ClientOrder` type)
- Modify: `src/lib/queries/shop-checkout.ts` (`loadSentOrder`)
- Modify: `src/lib/buyer-order-status.ts`
- Create: `src/lib/buyer-order-status.test.ts` (if absent; otherwise modify)
- Create: `src/lib/queries/web-orders.received.test.ts`

**Interfaces:**
- Consumes: Task 1's enum value.
- Produces: `ClientOrder["kind"]` becomes `"confirmed" | "submitted" | "received" | "declined"`; `buyerOrderStatus` returns `"Received by the team"` for `kind: "received"`. Task 12 reads both.

**This is the highest-risk task in the plan.** A `where` left at `SUBMITTED` here makes a buyer's own order vanish from their own screen between placing it and its confirmation, with no error and no type failure.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/queries/web-orders.received.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const webFindMany = vi.fn();
const webFindFirst = vi.fn();
const poFindMany = vi.fn();
const poFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webOrder: { findMany: webFindMany, findFirst: webFindFirst },
    purchaseOrder: { findMany: poFindMany, findFirst: poFindFirst },
  },
}));

const { listBuyerOrders, loadBuyerOrder } = await import(
  "@/lib/queries/web-orders"
);

beforeEach(() => {
  vi.clearAllMocks();
  webFindMany.mockResolvedValue([]);
  webFindFirst.mockResolvedValue(null);
  poFindMany.mockResolvedValue([]);
  poFindFirst.mockResolvedValue(null);
});

/**
 * Pinned by equality, not by subset. A status filter that silently narrows is
 * how a buyer's own order disappears from their own list — no error, no type
 * failure, exactly the class of defect Phase 16 recorded when documentId
 * became nullable.
 */
const IN_FLIGHT = { in: ["SUBMITTED", "RECEIVED", "DECLINED"] };

describe("a buyer can still see an order the team has received", () => {
  it("listBuyerOrders asks for it", async () => {
    // listBuyerOrders(buyerId, page = 1, perPage = 20, sort?)
    await listBuyerOrders("b1");
    expect(webFindMany.mock.calls[0]![0].where.status).toEqual(IN_FLIGHT);
  });

  it("loadBuyerOrder asks for it", async () => {
    await loadBuyerOrder("b1", "w1");
    expect(webFindFirst.mock.calls[0]![0].where.status).toEqual(IN_FLIGHT);
  });

  it("labels a received order as received, not as submitted", async () => {
    webFindMany.mockResolvedValue([
      {
        id: "w1",
        reference: "W-2609-00001",
        submittedAt: new Date("2026-09-16"),
        subtotal: { toFixed: () => "15.00" },
        status: "RECEIVED",
        declinedReason: null,
        buyerReference: null,
        _count: { lines: 1 },
      },
    ]);
    const { orders } = await listBuyerOrders("b1");
    expect(orders[0]!.kind).toBe("received");
  });
});
```

`listBuyerOrders` takes positional arguments — `(buyerId, page = 1, perPage = 20, sort?)` — and resolves `{ orders, total }`, not `{ rows }`. Both are quoted correctly above. Confirm the mocked Prisma surface matches the real one before running.

Create `src/lib/buyer-order-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buyerOrderStatus } from "@/lib/buyer-order-status";

describe("buyerOrderStatus", () => {
  it("says the team has it once received", () => {
    expect(buyerOrderStatus({ kind: "received", stage: null })).toBe(
      "Received by the team",
    );
  });

  it("still says awaiting confirmation before that", () => {
    expect(buyerOrderStatus({ kind: "submitted", stage: null })).toBe(
      "Awaiting confirmation",
    );
  });

  it("says not accepted for a declined order", () => {
    expect(buyerOrderStatus({ kind: "declined", stage: null })).toBe(
      "Not accepted",
    );
  });

  it("shows the stage once confirmed", () => {
    expect(
      buyerOrderStatus({ kind: "confirmed", stage: "DELIVERING" }),
    ).toBe("Delivering");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx vitest run src/lib/buyer-order-status.test.ts src/lib/queries/web-orders.received.test.ts
```

Expected: FAIL — the `where` is `{ in: ["SUBMITTED","DECLINED"] }` and `buyerOrderStatus` returns "Awaiting confirmation" for a received order.

- [ ] **Step 3: Widen the three queries**

In `src/lib/queries/web-orders.ts`, in **both** `listBuyerOrders` and `loadBuyerOrder`:

```ts
        status: {
          in: [
            WebOrderStatus.SUBMITTED,
            WebOrderStatus.RECEIVED,
            WebOrderStatus.DECLINED,
          ],
        },
```

In `src/lib/queries/shop-checkout.ts`, in `loadSentOrder`:

```ts
      status: {
        in: [
          WebOrderStatus.SUBMITTED,
          WebOrderStatus.RECEIVED,
          WebOrderStatus.CONFIRMED,
        ],
      },
```

- [ ] **Step 4: Widen the `kind` union and both mappings**

In `src/lib/queries/web-orders.ts`, change the `ClientOrder` type's `kind` to:

```ts
  kind: "confirmed" | "submitted" | "received" | "declined";
```

and replace **both** places that derive it (the `web.map` in `listBuyerOrders` and the return in `loadBuyerOrder`) with a shared helper defined once in that file, above them:

```ts
/** One mapping, so the list and the detail page cannot disagree. */
const webOrderKind = (status: WebOrderStatus) =>
  status === WebOrderStatus.DECLINED
    ? ("declined" as const)
    : status === WebOrderStatus.RECEIVED
      ? ("received" as const)
      : ("submitted" as const);
```

- [ ] **Step 5: Teach `buyerOrderStatus`**

In `src/lib/buyer-order-status.ts`:

```ts
export function buyerOrderStatus(order: {
  kind: "confirmed" | "submitted" | "received" | "declined";
  stage: PoStage | null;
}): string {
  if (order.kind === "declined") return "Not accepted";
  if (order.kind === "confirmed" && order.stage) return stageLabel(order.stage);
  // Phase 41: a person has it. Said plainly, because the gap between sending
  // an order and hearing a date can be days and silence reads as lost.
  if (order.kind === "received") return "Received by the team";
  return "Awaiting confirmation";
}
```

- [ ] **Step 6: Run the tests and the typechecker**

```bash
npx vitest run src/lib/ && npx tsc --noEmit
```

Expected: PASS. `tsc` will name every other site that switches on `kind` — fix each; that exhaustiveness is why the union was widened before the UI task.

- [ ] **Step 7: Commit**

```bash
git add src/lib/queries/web-orders.ts src/lib/queries/shop-checkout.ts src/lib/buyer-order-status.ts src/lib/buyer-order-status.test.ts src/lib/queries/web-orders.received.test.ts
git commit -m "feat(shop): a buyer sees an order the team has received"
```

---

### Task 7: The ops-facing readers

**Files:**
- Modify: `src/lib/queries/web-orders.ts` (`openWebOrderCount`)
- Modify: `src/lib/queries/product-detail.ts` (open shop orders on a product)
- Modify: `src/lib/queries/buyer-detail.ts` (a buyer's open shop orders)
- Modify: `src/lib/web-order-document.ts` (the draw guard)
- Modify: `src/lib/queries/buyer-activity.ts` (the status label map)
- Modify: `src/lib/queries/product-detail.test.ts` and `src/lib/queries/buyer-activity.test.ts`

**Interfaces:**
- Consumes: Task 1's enum value.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

In `src/lib/queries/product-detail.test.ts`, add:

```ts
it("counts an order the team has received among a product's open shop orders", async () => {
  await loadProductDetail("prd1");
  const call = webOrderLineFindMany.mock.calls[0]![0];
  expect(call.where.webOrder.status).toEqual({
    in: ["SUBMITTED", "RECEIVED"],
  });
});
```

Match the existing mock names in that file rather than inventing `webOrderLineFindMany` if it is called something else.

In `src/lib/queries/buyer-activity.test.ts`, add:

```ts
it("has a label for a received order", () => {
  expect(WEB_ORDER_STATUS_LABEL.RECEIVED).toBe("Received");
});
```

using whatever the map is actually exported as in `buyer-activity.ts` (it is the object whose `SUBMITTED` key reads `"Submitted"`; export it if it is currently module-private).

- [ ] **Step 2: Run them and watch them fail**

```bash
npx vitest run src/lib/queries/product-detail.test.ts src/lib/queries/buyer-activity.test.ts
```

Expected: FAIL on both.

- [ ] **Step 3: Widen all five**

`src/lib/queries/web-orders.ts` — still work waiting on a person, so it still belongs on the dashboard queue:

```ts
export const openWebOrderCount = () =>
  prisma.webOrder.count({
    where: {
      status: { in: [WebOrderStatus.SUBMITTED, WebOrderStatus.RECEIVED] },
    },
  });
```

`src/lib/queries/product-detail.ts` and `src/lib/queries/buyer-detail.ts` — replace each `status: WebOrderStatus.SUBMITTED` with:

```ts
      status: { in: [WebOrderStatus.SUBMITTED, WebOrderStatus.RECEIVED] },
```

`src/lib/web-order-document.ts` — the guard currently refuses anything that is neither `SUBMITTED` nor `CONFIRMED`. Add `RECEIVED`; refusing it would stop the buyer's own purchase-order document drawing for the whole time the team is holding the order:

```ts
      source.status !== WebOrderStatus.SUBMITTED &&
      source.status !== WebOrderStatus.RECEIVED &&
      source.status !== WebOrderStatus.CONFIRMED
```

`src/lib/queries/buyer-activity.ts` — add to the label map beside `SUBMITTED: "Submitted"`:

```ts
  RECEIVED: "Received",
```

- [ ] **Step 4: Run the suite and the typechecker**

```bash
npx vitest run && npx tsc --noEmit
```

Expected: all pass. A `Record<WebOrderStatus, string>` map will fail to compile until the new key is added — that is the check doing its job.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/web-orders.ts src/lib/queries/product-detail.ts src/lib/queries/buyer-detail.ts src/lib/web-order-document.ts src/lib/queries/buyer-activity.ts src/lib/queries/product-detail.test.ts src/lib/queries/buyer-activity.test.ts
git commit -m "feat(ops): received orders stay visible everywhere open orders are counted"
```

---

### Task 8: The list query — the new state, the chips, the sort key

**Files:**
- Modify: `src/lib/queries/po-list.sql.ts`
- Modify: `src/lib/queries/po-list.sql.test.ts`

**Interfaces:**
- Consumes: Task 1's enum value.
- Produces: `PoListFilters["status"]` gains `"received"`; `PO_LIST_SORT_KEYS` gains `"source"`; new export `poListReceivedQuery(filters: PoListFilters): Prisma.Sql`. Tasks 9 and 10 use all three.

- [ ] **Step 1: Write the failing tests**

In `src/lib/queries/po-list.sql.test.ts`:

```ts
describe("the received state", () => {
  it("brings received orders into the list and labels them", () => {
    const sql = sqlOf(poListQuery(ALL, { key: "poDate", dir: "desc" }, 0, 10));
    expect(sql).toContain("'SUBMITTED'");
    expect(sql).toContain("'RECEIVED'");
    // The row must say which it is, or the badge cannot differ.
    expect(sql).toContain('wo."status"');
  });

  it("partitions the shop backlog across the two chips", () => {
    const needsReview = sqlOf(
      poListQuery({ status: "needs-review" }, { key: "poDate", dir: "desc" }, 0, 10),
    );
    const received = sqlOf(
      poListQuery({ status: "received" }, { key: "poDate", dir: "desc" }, 0, 10),
    );
    // If both counted the same rows, receiving would tell the team nothing.
    expect(needsReview).toContain("= 'SUBMITTED'");
    expect(needsReview).not.toContain("'RECEIVED'");
    expect(received).toContain("= 'RECEIVED'");
    expect(received).not.toContain('"Extraction"');
  });

  it("the shop chip means every shop-sourced row, confirmed ones included", () => {
    const sql = sqlOf(
      poListQuery({ status: "web" }, { key: "poDate", dir: "desc" }, 0, 10),
    );
    expect(sql).toContain('"PurchaseOrder"');
    expect(sql).toContain('"WebOrder"');
  });

  it("sorts on source without leaving the allow-list", () => {
    const sql = sqlOf(
      poListQuery(ALL, { key: "source", dir: "asc" }, 0, 10),
    );
    expect(sql).toContain('merged."source"');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx vitest run src/lib/queries/po-list.sql.test.ts
```

Expected: FAIL on all four.

- [ ] **Step 3: Add the sort key**

```ts
export const PO_LIST_SORT_KEYS = [
  "poNumber",
  "buyerName",
  "poDate",
  "itemCount",
  "total",
  "status",
  "source",
  "uploadedBy",
  "confirmedBy",
] as const;
```

and in `ORDER_COLUMNS`:

```ts
  source: 'merged."source"',
```

- [ ] **Step 4: Add the filter value**

```ts
  status?:
    | "all"
    | "confirmed"
    | "needs-review"
    | "received"
    | "extracting"
    | "failed"
    | "web";
```

- [ ] **Step 5: Split the web branch across the chips**

Replace `includesWebOrders` and the status condition inside `webOrderRows`:

```ts
/**
 * A submitted shop order is work waiting on a person, exactly like a draft.
 * A received one is work a person has picked up — which is the whole reason
 * the state exists, so the two chips partition the shop backlog rather than
 * overlapping. `web` takes both, because it means "came from the shop".
 */
const includesWebOrders = (status: PoListFilters["status"]) =>
  status === undefined ||
  status === "all" ||
  status === "needs-review" ||
  status === "received" ||
  status === "web";

const webStatusCondition = (status: PoListFilters["status"]) =>
  status === "needs-review"
    ? Prisma.sql`wo."status" = 'SUBMITTED'`
    : status === "received"
      ? Prisma.sql`wo."status" = 'RECEIVED'`
      : Prisma.sql`wo."status" IN ('SUBMITTED', 'RECEIVED')`;
```

In `webOrderRows`, use it and emit the real status:

```ts
  const conditions: Prisma.Sql[] = [webStatusCondition(filters.status)];
```

and replace the hardcoded status column:

```ts
      wo."status"                               AS "status",
```

- [ ] **Step 6: Let `received` and `web` reach the other two branches correctly**

`includesDrafts` must **not** include `"received"` (a draft has no shop order to receive):

```ts
const includesDrafts = (status: PoListFilters["status"]) =>
  status === undefined ||
  status === "all" ||
  status === "needs-review" ||
  status === "extracting" ||
  status === "failed";
```

`includesOrders` must now include `"web"`, so a **confirmed** shop order appears under the chip that claims to filter on exactly that:

```ts
const includesOrders = (status: PoListFilters["status"]) =>
  status === undefined ||
  status === "all" ||
  status === "confirmed" ||
  status === "web";
```

and in `orderRows`, when `filters.status === "web"`, add a condition restricting to orders that came from the shop:

```ts
  // The Source column calls these rows "Shop"; the chip must agree with it.
  if (filters.status === "web") {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "WebOrder" w WHERE w."purchaseOrderId" = po."id")`,
    );
  }
```

Use the same alias `po` the surrounding `orderRows` query already uses — read it first.

- [ ] **Step 7: Add the count query**

Beside `poListNeedsReviewQuery`:

```ts
/** The "Received" chip's number, built exactly as the needs-review one is. */
export function poListReceivedQuery(filters: PoListFilters): Prisma.Sql {
  return Prisma.sql`
    SELECT COUNT(*)::int AS "count"
    FROM (${baseSelect({ ...filters, status: "received" })}) AS merged
  `;
}
```

- [ ] **Step 8: Run the tests and the typechecker**

```bash
npx vitest run src/lib/queries/po-list.sql.test.ts && npx tsc --noEmit
```

Expected: PASS, including the pre-existing loose-join tests.

- [ ] **Step 9: Commit**

```bash
git add src/lib/queries/po-list.sql.ts src/lib/queries/po-list.sql.test.ts
git commit -m "feat(purchase-orders): the list knows received orders and sorts on source"
```

---

### Task 9: The badge, the chip and the page's allow-list

**Files:**
- Modify: `src/components/portal/StatusBadge.tsx`
- Modify: `src/components/purchase-orders/PoFilters.tsx`
- Modify: `src/app/(portal)/purchase-orders/page.tsx`

**Interfaces:**
- Consumes: Task 8's `"received"` filter value and `poListReceivedQuery`.
- Produces: `IntakeStatus` gains `"RECEIVED"`; `StatusChip` gains `"received"`; `PoFilters` gains a `received: number` prop beside its existing `needsReview: number`.

- [ ] **Step 1: Add the status**

In `src/components/portal/StatusBadge.tsx`:

```ts
export type IntakeStatus =
  | "EXTRACTING"
  | "NEEDS_REVIEW"
  | "RECEIVED"
  | "FAILED"
  | "NOT_CONFIRMED";
```

and in `INTAKE_STATUS`, between `NEEDS_REVIEW` and `FAILED`:

```ts
  // `accent-blue` is the palette's "a process is running right now"
  // (00-master.md §4) — which is exactly true of an order a person has
  // picked up. It already covers uploading, extracting, in production and
  // delivering; this is a fifth thing in flight, not a second meaning.
  RECEIVED: {
    label: "Received",
    text: "text-accent-blue",
    dot: "bg-accent-blue",
  },
```

- [ ] **Step 2: Add the chip**

In `src/components/purchase-orders/PoFilters.tsx`, extend the type and the list:

```ts
export type StatusChip =
  | "all"
  | "confirmed"
  | "needs-review"
  | "received"
  | "extracting"
  | "failed"
  | "web";
```

```ts
  {
    value: "received",
    label: "Received",
    dot: INTAKE_STATUS.RECEIVED.dot,
  },
```

placed immediately after the `needs-review` entry. Add a `received: number` prop alongside `needsReview`, and replace the count expression inside `CHIPS.map` (near line 183) with:

```tsx
            // The count comes from the same query that feeds the table, so a
            // row leaving the queue changes the chip on the same render.
            const count =
              chip.value === "needs-review" && needsReview > 0
                ? needsReview
                : chip.value === "received" && received > 0
                  ? received
                  : null;
```

- [ ] **Step 3: Add it to the page's allow-list and load the count**

In `src/app/(portal)/purchase-orders/page.tsx`:

```ts
const STATUSES: StatusChip[] = [
  "all",
  "confirmed",
  "needs-review",
  "received",
  "extracting",
  "failed",
  "web",
];
```

**This step is not optional.** A chip whose value is missing from `STATUSES` changes the URL and is then silently ignored by the page — the defect Phase 11 hit on `/products`, which the file's own comment warns about.

Then run `poListReceivedQuery` beside the existing needs-review count (same `$queryRaw` shape, same `Promise.all`) and pass the result to `PoFilters` as `received`.

- [ ] **Step 4: Verify in a browser**

```bash
npm run dev
```

Visit `/purchase-orders`. Expected: a **Received** chip between *Needs review* and *Extracting*, with a count of 0 in development until Task 11 lets you receive something. Clicking it must set `?status=received` and return an empty table — **not** the unfiltered list, which is what a missing `STATUSES` entry looks like.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal/StatusBadge.tsx src/components/purchase-orders/PoFilters.tsx "src/app/(portal)/purchase-orders/page.tsx"
git commit -m "feat(purchase-orders): a Received badge and its own filter chip"
```

---

### Task 10: The Source column

**Files:**
- Modify: `src/components/purchase-orders/PoTable.tsx`

**Interfaces:**
- Consumes: `PoRow.source` (already present) and Task 8's `"source"` sort key.
- Produces: nothing new.

- [ ] **Step 1: Add the column**

In `src/components/purchase-orders/PoTable.tsx`, insert between the `status` and `uploadedBy` column definitions:

```tsx
    {
      key: "source",
      header: "Source",
      // Deliberately not mobileHidden. Card mode drops the two avatar columns
      // as noise, but where an order came from is the one thing this column
      // exists to say.
      cell: (row) => (
        <span className="inline-flex shrink-0 items-center gap-xxs rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)]">
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${
              row.source === "web" ? "bg-accent-blue" : "bg-ink-tertiary"
            }`}
          />
          {row.source === "web" ? "Shop" : "Manual"}
        </span>
      ),
    },
```

- [ ] **Step 2: Remove the chip the column replaces**

In the `poNumber` cell, delete the whole `row.source === "web" && row.fileType !== "web" ? (…) : null` block and the comment above it. It existed only because there was no column to say this in.

- [ ] **Step 3: Give *Uploaded by* back to people**

Replace that column's cell with:

```tsx
      cell: (row) =>
        row.uploadedByName ? (
          <PersonChip name={row.uploadedByName} image={row.uploadedByImage} />
        ) : (
          // A shop order has no uploader. Source says where it came from.
          <span className="text-ink-disabled">—</span>
        ),
```

and delete the `row.source === "web" ? "From the shop" : …` branch with its comment.

- [ ] **Step 4: Verify in a browser**

Visit `/purchase-orders`. Expected: every row carries **Shop** or **Manual**; no `WEB` chip beside any PO number; *Uploaded by* shows a person or `—`, never "From the shop". Click the **Source** header — the URL gains `?sort=source&dir=asc` and the rows reorder.

Then measure, at 390 / 768 / 1440:

```js
document.documentElement.scrollWidth === window.innerWidth
```

Expected: `true` at all three. The table scrolls inside its own container; the page must not.

- [ ] **Step 5: Commit**

```bash
git add src/components/purchase-orders/PoTable.tsx
git commit -m "feat(purchase-orders): a Source column, replacing the WEB chip"
```

---

### Task 11: Receive on the ops screen

**Files:**
- Modify: `src/components/web-orders/WebOrderReviewForm.tsx`

**Interfaces:**
- Consumes: Task 3's `receiveWebOrder`, Task 4's refusal string, `order.status` (already on `OpsWebOrder`).
- Produces: nothing new.

- [ ] **Step 1: Import the action and derive the state**

Add `receiveWebOrder` to the existing `@/actions/web-orders` import, and inside the component, above the return:

```tsx
  const received = order.status === "RECEIVED";
```

- [ ] **Step 2: Put Receive in front of Confirm**

In the button row, **before** the Confirm button:

```tsx
        {received ? null : (
          <Button
            pending={pending && !declining}
            onClick={() =>
              startTransition(async () => {
                setDeclining(false);
                const result = await receiveWebOrder(order.id);
                if (result.success) {
                  toast.success("Order received. The buyer has been told.");
                  router.refresh();
                } else {
                  toast.error(result.error);
                }
              })
            }
          >
            Receive order
          </Button>
        )}
```

- [ ] **Step 3: Gate Confirm and say why**

Change the Confirm button's `disabled` to:

```tsx
          disabled={blockedByTotals || !deliveryDate || !received}
```

and give it `variant="secondary"` while `!received`, so the primary ink pill is on the action the screen actually wants next.

In the chain of explanatory `<p>` elements below the buttons, add a branch **first** — before `blockedByTotals` — so the most immediate blocker is the one named:

```tsx
        {!received ? (
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            Receive this order before confirming it.
          </p>
        ) : blockedByTotals ? (
```

The wording is identical to the server's refusal in Task 4 on purpose: the screen and the action must not describe the same rule two ways. **The server check is the gate; this is the courtesy.**

- [ ] **Step 4: Drive it in a browser, end to end**

With `npm run dev` running, signed in as ops staff, open a `SUBMITTED` shop order at `/web-orders/{id}`.

1. Confirm is disabled and the caption reads "Receive this order before confirming it."
2. Press **Receive order** → toast "Order received. The buyer has been told."
3. The button disappears, Confirm becomes the ink pill and is enabled once a delivery date is set.
4. Read the row back:

```bash
npx tsx -e "
import { prisma } from './src/lib/prisma';
const o = await prisma.webOrder.findFirst({
  where: { status: 'RECEIVED' },
  select: { reference: true, status: true, receivedAt: true,
            receivedBy: { select: { name: true } } },
});
console.log(o);
await prisma.\$disconnect();
"
```

Expected: `status: 'RECEIVED'`, a real `receivedAt`, and the name of whoever pressed it.

5. `/purchase-orders` now shows that row under the **Received** chip with a *Received* badge and Source **Shop**, and the *Needs review* count has dropped by one.

- [ ] **Step 5: Commit**

```bash
git add src/components/web-orders/WebOrderReviewForm.tsx
git commit -m "feat(web-orders): receive an order before confirming it"
```

---

### Task 12: The buyer's step bar

**Files:**
- Modify: `src/components/shop/checkout/CheckoutSteps.tsx`
- Modify: the four screens that render it (find them with `grep -rln CheckoutSteps src/app src/components`)

**Interfaces:**
- Consumes: Task 6's `kind: "received"`.
- Produces: `CheckoutSteps({ current, state })` where `state?: "pending" | "received" | "confirmed"` **replaces** the boolean `complete`.

- [ ] **Step 1: Replace the boolean with the state**

```tsx
/**
 * What the last step is called once it has happened. "We'll be in touch" is a
 * promise; on a received order a person has it (Phase 41) and on a confirmed
 * one the promise has been kept (Phase 38). Leaving either in the future
 * tense reads as a call still owed.
 */
const LAST_STEP_LABEL = {
  pending: null,
  received: "Received",
  confirmed: "Confirmed",
} as const;

export type CheckoutState = "pending" | "received" | "confirmed";

export function CheckoutSteps({
  current,
  /** How far the order has actually got, once it has left the buyer's hands. */
  state = "pending",
}: {
  current: CheckoutStep;
  state?: CheckoutState;
}) {
```

Inside the map, replace the three `complete`-derived values:

```tsx
          const done = state !== "pending";
          const isDone = done || position < current;
          const isCurrent = !done && position === current;
          const override =
            position === CHECKOUT_STEPS.length ? LAST_STEP_LABEL[state] : null;
          const label = override ?? step;
```

**No fifth step.** The bar is a checkout progress indicator; an ops queue state does not earn a column in the buyer's mental model of their own checkout.

- [ ] **Step 2: Update all four callers**

`complete={true}` becomes `state="confirmed"`; `complete={false}` or an omitted prop becomes nothing at all. On the buyer's order detail screen, derive it:

```tsx
  state={
    order.kind === "confirmed"
      ? "confirmed"
      : order.kind === "received"
        ? "received"
        : "pending"
  }
```

`tsc` will name any caller missed, because `complete` no longer exists.

- [ ] **Step 3: Typecheck and run the suite**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: both clean.

- [ ] **Step 4: Verify as the buyer**

Signed in as a `CLIENT` on the shop host, open the order received in Task 11. Expected: `/orders` reads **Received by the team**; the order page's step bar's last step reads **Received**; the earlier steps read as done.

- [ ] **Step 5: Commit**

```bash
git add src/components/shop/checkout/CheckoutSteps.tsx src/app src/components
git commit -m "feat(shop): the step bar says Received while the team holds an order"
```

---

### Task 13: Documentation, the full sweep, and cleanup

**Files:**
- Modify: `docs/specs/00-master.md` (§4 status palette)
- Modify: `context/current-feature.md`
- Modify: `docs/specs/41-order-receipt-and-source.md` (§10 becomes what was measured)

- [ ] **Step 1: Record the palette entry**

In `docs/specs/00-master.md` §4, extend the `accent-blue` row so "received" is named beside uploading, extracting, in production and delivering — the palette table is the reason a colour means one thing in the chips and in the badges, and a status that is not listed there invites the next person to pick a new hue.

- [ ] **Step 2: Run everything**

```bash
npx vitest run && npx tsc --noEmit && npm run lint && npm run build
```

Expected: all green. Lint carries **2 pre-existing warnings** (`username` unused in `src/actions/clients.test.ts` and `src/lib/validation/clients.test.ts`) and **0 errors** — anything beyond that is yours.

- [ ] **Step 3: The overflow sweep**

At 390 / 768 / 1440, on `/purchase-orders`, `/web-orders/{id}` and the buyer's order page — nine combinations — assert:

```js
document.documentElement.scrollWidth === window.innerWidth
```

Record the numbers, not an adjective. Also list every element under 44px at 390 and check each against the accepted list in `context/current-feature.md`; a **new** one is a defect to record as found, not to wave through.

- [ ] **Step 4: Prove the sort sorts the whole list**

Sort `/purchase-orders` by Source with more rows than fit one page, and check the first row against a figure only the whole list has — the same proof Phase 35 used for its own sort. Page-local sorting cannot produce it.

- [ ] **Step 5: Clean up, counted both ends**

Before starting the browser work, record `webOrder.count()` by status, `purchaseOrder.count()`, `user.count()` and `product.count()`. Afterwards, delete every row this task created **by id** — never by a wildcard — restore any order moved to `RECEIVED` back to `SUBMITTED` (clearing `receivedById` and `receivedAt`), and read the same counts back. They must match exactly. If a user was promoted to super admin for any check, revert it and **read the row back** rather than trusting the update's return value.

- [ ] **Step 6: Rewrite the spec's §10 as what was measured**

Replace the acceptance criteria with the figures actually read — statuses, counts, timings, the sweep's nine numbers — and add a **Not verified** section. Anything on production belongs there unless it was genuinely driven there.

- [ ] **Step 7: Update `context/current-feature.md`**

Move Phase 40 under "Previous phase" and write Phase 41's entry in the house style: what was asked for in the user's own words, what was built, what was verified with figures, and what was not. Record explicitly that **the admin notification email already existed** (spec §1) so nobody rebuilds it, and that the open-order cap was removed on 2026-09-16 so nothing throttles submission.

- [ ] **Step 8: Commit and stop**

```bash
git add -A
git commit -m "docs(web-orders): record Phase 41 as measured"
```

**Do not merge to `main`.** Ask first — and before merging, check that production's `DIRECT_URL` no longer points at the pooled Neon host, because this branch carries a migration (spec §11).

---

## Self-Review

**Spec coverage:** §2 → Task 1. §3 → Tasks 2, 3. §4 → Tasks 4, 11. §5 → Tasks 2, 6, 12. §6 → Tasks 8, 9, 10. §7 → Tasks 5, 6, 7, 8 (all eleven rows; `deletePurchaseOrder` as the writer it is). §8 → nothing to build, guarded by leaving `notify()` untouched. §9 → out of scope, not planned. §10 → Task 13 Step 6. §11 → Task 13 Step 8.

**Type consistency checked:** `receiveWebOrder(webOrderId: string)` is the name in Tasks 3, 9 and 11. `"Receive this order before confirming it."` is one string in Task 4 (server) and Task 11 (screen). `poListReceivedQuery` is named in Tasks 8 and 9. `ClientOrder["kind"]` gains `"received"` in Task 6 and is consumed in Tasks 6 and 12. `IntakeStatus.RECEIVED` is defined in Task 9 and referenced by `INTAKE_STATUS.RECEIVED.dot` in the same task.

**Known soft spot, flagged rather than papered over:** Task 7 tells the implementer to match existing mock names in `product-detail.test.ts` and `buyer-activity.test.ts`, which this plan has not read line by line — the assertions there state the intent, and the surrounding harness must be copied from the neighbouring tests in those files. `listBuyerOrders`' signature and the chip-count expression were both checked against the source and are quoted literally. Everything else is literal.

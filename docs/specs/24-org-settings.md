# Phase 24 — Organisation settings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A super admin edits the supplier contact details the public shop
displays — name, email, phone, address — from inside the portal, with no Vercel
access and no redeploy.

**Architecture:** One row in a new `OrgSettings` table, read through a single
cached resolver that falls back **per field** to the existing `ZEN_GARDEN_*`
environment variables. A card on `/admin` writes it. The only existing component
that changes is `ShopFooter`, which reads `env` directly today and takes props
after this.

**Tech Stack:** As the portal: Next.js 16 App Router, Prisma 7 on Neon, Server
Actions, Zod 4. Nothing new.

**Spec:** this file. Read `docs/specs/design/shop/00-overview.md` §"Decisions
stated rather than asked" (which anticipated this phase), `docs/specs/09-admin.md`
(the admin shell and its super-admin guard) and `docs/specs/00-master.md` §4.

**Branch:** `feature/org-settings`. Depends on 09 (the `(admin)` shell) and 17
(the storefront footer and account menu). Independent of 18–22.

## Global constraints

- **Super admin only.** The `(admin)` shell already enforces it; the action
  enforces it again, because a route guard is not an authorisation model.
- **These values render on the public shop.** There is no redeploy gate any
  more, so the card says so and the copy is written for someone who can publish
  a typo instantly.
- **The fallback is per field, never per row.** See §2 — this is the one
  decision that a reasonable implementation gets wrong.
- All UI through the `@theme` tokens in `src/app/globals.css`. No raw hex, no px
  font size, no arbitrary Tailwind value. Sentence-case labels. 44px touch
  targets below `sm`.
- TypeScript strict, no `any`. Every Server Action returns
  `{ success, data, error }`.

---

## 0. Why this exists

`ZEN_GARDEN_NAME`, `ZEN_GARDEN_EMAIL`, `ZEN_GARDEN_PHONE` and `ZEN_GARDEN_ADDRESS`
(`src/lib/env.ts:23-26`) are business facts — the address on the footer, the
number a customer rings, the inbox behind *Talk to our team*. Today changing any
of them needs Vercel access **and** a redeploy, which puts a phone number behind
a deployment pipeline and out of reach of the person who actually knows it.

`docs/specs/design/shop/00-overview.md:41` already recorded the answer: *"A
settings table editable by a super admin is the better long-term home and is a
phase of its own if asked for."* It has been asked for.

The prompt was narrower — one field, `ZEN_GARDEN_EMAIL`, which is unset in
production and is why the shop footer has no contact row. All four are in scope
because they render as one footer block and one account-menu row; making one
editable and leaving three in Vercel means the footer is maintained in two
places depending on which line you want to change.

## 1. Data model

```prisma
/// Exactly one row, id "singleton". Org-wide settings a super admin owns.
model OrgSettings {
  id              String   @id @default("singleton")
  supplierName    String?
  supplierEmail   String?
  supplierPhone   String?
  supplierAddress String?
  updatedAt       DateTime @updatedAt
  updatedById     String?
  updatedBy       User?    @relation("orgSettingsUpdatedBy", fields: [updatedById], references: [id])
}
```

`User.orgSettingsUpdates OrgSettings[] @relation("orgSettingsUpdatedBy")`.
Migration `prisma/migrations/20260911140000_org_settings/migration.sql`.

**Typed columns, not key/value.** With four known fields — seven once Phase 19
adds the registration number and tax label — a key/value table buys nothing and
costs type safety at every read, turning each one into a string lookup that the
compiler cannot check.

**The singleton is enforced in SQL, not by convention:**

```sql
ALTER TABLE "OrgSettings" ADD CONSTRAINT "OrgSettings_singleton"
  CHECK (id = 'singleton');
```

A second row appearing and the app silently reading whichever came back first is
exactly the failure a comment does not prevent. Same reasoning as Phase 15's
`role <> 'CLIENT' OR buyerId IS NOT NULL`.

**`updatedById` is nullable with `onDelete: SetNull`.** Phase 09 soft-deletes
users precisely so uploads and stage events stay attributed, so this will rarely
fire — but the settings row must survive whoever last touched it either way, and
a cascade here would delete the organisation's configuration because a person
left.

## 2. Reading — the resolver

```ts
// src/lib/org-settings.ts
export type SupplierDetails = {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

/** Database wins per field; an unset field falls back to its env var. */
export const loadSupplierDetails: () => Promise<SupplierDetails>;

/** For the admin card: what is stored, and what env would supply if it were not. */
export const loadSupplierSettings: () => Promise<{
  stored: SupplierDetails;
  fallback: SupplierDetails;
  updatedAt: Date | null;
  updatedByName: string | null;
}>;
```

**Per field, not per row, and this is the decision to get right.** Resolving per
row — "is there a settings row? then use it, else use env" — means saving only
the email blanks the phone that is still living in Vercel. Each field resolves
independently:

```ts
email: row?.supplierEmail ?? env.ZEN_GARDEN_EMAIL ?? null
```

Wrapped in React's `cache()` so one request makes one query however many
components ask. The shop layout already makes two queries; this is noise beside
them, and it is a primary-key lookup.

**`""` must never be stored.** The action trims every field to null, so clearing
a field in the form genuinely returns it to the env fallback rather than storing
an empty string that would shadow it forever.

## 3. What changes at the read sites

| File | Today | After |
|---|---|---|
| `src/app/(storefront)/shop/layout.tsx:71` | `supplierEmail={env.ZEN_GARDEN_EMAIL ?? null}` | from `loadSupplierDetails()` |
| `src/components/shop/ShopFooter.tsx:61` | reads `env.ZEN_GARDEN_*` directly | takes a `supplier: SupplierDetails` prop |

`ShopFooter`'s own doc comment says it reads `env` directly "unlike
`ShopAccountMenu`". That distinction goes away: both take props, and the layout
is the one place that resolves them. Its comment is updated rather than left
describing the old arrangement.

The env vars stay in `env.ts` and `.env.example` as fallbacks. Nothing about a
fresh clone or a preview deployment changes.

## 4. The screen

A **Contact details** section on `/admin`, rendered **after** `UsersTable`.

**A stated deviation, not an oversight:** that page's `h1` is *Users* under the
eyebrow *Access*, so a contact-details card sits under a heading that does not
describe it. The alternatives are worse for now — retitling the page changes a
screen nobody asked me to change, and a second route for four fields is more
chrome than they earn. The card takes its own `h2`. **When a third kind of
setting arrives, `/admin/settings` earns its own page and this moves there.**

The card:

- `h2` **Contact details**, and the caption **"These appear on your public
  shop."** — the redeploy gate is gone and the screen should say so.
- Four fields: Supplier name · Email · Phone · Address (a `Textarea`, line
  breaks preserved, because that is how the footer renders it).
- An empty field shows its env value as placeholder text: *"Currently
  portal@lovinghandsportal.com — from the environment"*, or *"Not set"* when
  there is no fallback either. This is what makes the fallback legible instead
  of spooky: the reader sees what the shop is showing without opening Vercel.
- One **Save** (the ink pill), `pending` while it runs.
- Beneath it: "Last changed by {name} on {date}", omitted before the first save.

## 5. The action

```ts
// src/actions/org-settings.ts
export async function updateSupplierDetails(
  patch: SupplierPatch,
): Promise<ActionResult>;
```

`requireSuperAdmin()`; `supplierPatchSchema.safeParse`; `upsert` on
`{ id: "singleton" }` writing the four fields plus `updatedById`.

Validation in `src/lib/validation/org-settings.ts`:

- `supplierName` — optional text, max 120
- `supplierEmail` — optional, and a real address when present
- `supplierPhone` — optional text, max 32, unparsed (Malaysian numbers are
  written a dozen ways)
- `supplierAddress` — optional text, max 300

`optionalText` and `optionalEmail` exist already but are module-private in
`src/lib/validation/clients.ts` (Phase 23). They move to
`src/lib/validation/common.ts` and both files import them. Copying them would
mean a company email and a supplier email validating differently the first time
one is edited.

`revalidatePath` names the storefront's **real** paths — `/shop`,
`/shop/products`, `/shop/cart` — not the browser-relative ones. This is
`src/lib/shop-routes.ts`'s rule, and `shopPath` exists for exactly it.

## 6. Acceptance criteria

1. A super admin changes the supplier email on `/admin`; the shop footer and the
   account menu's *Talk to our team* link show the new value **with no
   redeploy**.
2. Saving only the email leaves a phone that lives in an env var still showing
   on the shop — the fallback resolves per field.
3. Clearing a field returns it to its env value rather than blanking the row.
4. An ops member cannot reach the card and cannot call the action.
5. A second `OrgSettings` row is refused by the database.
6. An invalid email is refused with a message, and the typed values are kept.
7. "Last changed by" names the person who saved and the date.
8. Zero horizontal overflow on `/admin` and the shop home at 390, 768 and 1440.

## 7. Out of scope

- **Phase 19's `ZEN_GARDEN_REGISTRATION_NO`, `ZEN_GARDEN_TAX_LABEL` and
  `ZEN_GARDEN_TAX_RATE`** — they are in the overview's list but not in `env.ts`,
  because the purchase-order document that needs them is not built. They join
  this table when Phase 19 needs them. Adding columns for an unbuilt feature is
  guessing at its shape.
- **Making anything else configurable** — the open-order cap, the extraction
  model, the file-size limit. Each is a deliberate engineering constraint rather
  than a business fact, and a settings screen that accumulates them becomes a
  place to change things nobody should change from a browser.
- **An audit trail of past values.** `updatedAt` and `updatedById` say who
  touched it last; a history table is a different feature.
- **Editing these on the shop host.** They are ops-owned.

# Phase 48 — Role-based access and the permission grid

Version 1.0 — 2026-09-18. Owner: Chris Lam. Audience: AI coders.
Read `docs/specs/00-master.md` first. Branch: `feature/role-based-access`.

---

## 1. What this is

The portal has had two ops powers since Phase 01: **staff** and **super
admin**. `requireUser()` means "any signed-in ops person", and it guards
everything that matters — confirming a purchase order, declining a shop
order, editing an order's header, and advancing any order through any of the
six fulfilment stages. A warehouse hand and the person who signs off quality
control hold identical power, and neither is the person who should be
confirming a customer's purchase order.

This phase gives each ops job its own role, scopes stage moves to the job
that owns them, and puts the whole thing in a grid a super admin can edit
without a deploy.

Asked for as: four roles; each ops role owns only the status moves that
belong to their job; everything else view-only or hidden; a configurable
permission matrix on the user-management page, stored rather than hardcoded;
enforced on the server, not by hiding buttons.

**Not changed by this phase**, deliberately: the stage names and their
order, the notes and activity feed (it still records who advanced), the shop
carton-quantity work, and buyer-facing shop auth. `CLIENT` is not an ops role
and appears nowhere in the grid.

## 2. The roles

`Role` grows from three values to six:

| Value | Who | Assignable |
|---|---|---|
| `SUPER_ADMIN` | Runs the portal | yes |
| `PRODUCTION_PLANNER` | Starts production | yes |
| `QC` | Signs off quality | yes |
| `WAREHOUSE` | Books in, ships, delivers | yes |
| `MEMBER` | Ops staff who only need to look | yes |
| `CLIENT` | A buyer's contact on the shop host | never, from the admin room |

A user has exactly one role. A super admin assigns it.

**`MEMBER` is kept rather than retired.** Every non-super-admin ops user
holds it today, so retiring it would mean a data migration that guesses at
each person's job. Instead it keeps its rows and becomes the view-only role:
see everything, change nothing. Two things fall out of that and are worth not
re-deriving:

- `resolveGoogleSignIn` in `src/lib/auth-access.ts` creates an
  `AUTO_APPROVE_DOMAIN` match as `Role.MEMBER`. After this phase that path
  admits someone at the *least* privileged role rather than a role that can
  confirm purchase orders. This is an improvement and is left as it is.
- Nobody's access widens on deploy. Every existing member's powers narrow.
  See §9.

`CLIENT` is excluded from the grid entirely. `can()` returns false for it
without a lookup, and the storefront keeps `requireClient` and its buyer
scoping untouched.

## 3. Data model

```prisma
enum Role {
  SUPER_ADMIN
  MEMBER
  CLIENT
  PRODUCTION_PLANNER
  QC
  WAREHOUSE
}

model PermissionGrant {
  role        Role
  action      String
  granted     Boolean
  updatedAt   DateTime @updatedAt
  /// Who last changed this cell. Null once that user's row is gone.
  updatedById String?
  updatedBy   User?    @relation("permissionEdits", fields: [updatedById], references: [id], onDelete: SetNull)

  @@id([role, action])
}
```

`action` is a plain `String`, not an enum, on purpose: the set of actions is
owned by `src/lib/permissions/actions.ts` and will grow with every feature.
An enum would put a migration in front of every new permission. A row whose
`action` is no longer in the registry is ignored at read time and swept by
the seed script; a registry key with no row denies by default.

`AuditAction` gains `PERMISSIONS_CHANGED`. `AuditEvent.buyerId` is already
nullable, so a grid edit writes `{ actorId, buyerId: null, detail }` with no
other schema change. The model's doc comment widens from "who did what to a
customer's account" to include portal-wide administrative changes.

### Two migrations, not one

`20260920090000_roles_and_permission_grants`
: `ALTER TYPE "Role" ADD VALUE` three times, `ALTER TYPE "AuditAction" ADD
  VALUE 'PERMISSIONS_CHANGED'`, and `CREATE TABLE "PermissionGrant"`.

`20260920090100_permission_grant_defaults`
: the `INSERT` of the default grants (§5).

They are split because **Postgres refuses to reference a newly added enum
value in the transaction that added it** — recorded in Phase 15, where
exactly this bit. Combined, the pair passes `migrate dev` against a database
that already carries the values and fails `migrate deploy` on production.

The seed inserts are written `ON CONFLICT DO NOTHING` so re-running is safe,
and `prisma/seed.ts` calls the same defaults so a fresh clone has a working
grid.

## 4. The action registry

`src/lib/permissions/actions.ts` — pure, no Prisma import, importable from a
client component so the grid and the server read one list.

```ts
export type PermissionGroup =
  | "Dashboard" | "Purchase orders" | "Fulfilment"
  | "Catalogue" | "Buyers" | "Administration";

const RAW_ACTIONS = [ ... ] as const;

export type PermissionKey = (typeof RAW_ACTIONS)[number]["key"];

export type PermissionAction = {
  /** Stable. Stored in the database. Never renamed. */
  key: PermissionKey;
  /** The grid's first column. */
  label: string;
  /** One line under the label, saying what the row actually permits. */
  description: string;
  group: PermissionGroup;
  /** Administration rows: shown in the grid, not editable. See §7. */
  locked?: true;
};

export const PERMISSION_ACTIONS: readonly PermissionAction[] = RAW_ACTIONS;
```

`PermissionKey` being a union derived from the array is load-bearing: a typo
in `requirePermission("po.edti")` fails the build rather than denying silently
at runtime. The array is declared `as const` and re-exported through a typed
view because `as const satisfies` narrows each element to its own literal
type, and `locked` then does not exist on the elements that lack it — which
`tsc` caught the moment the grid tried to read it.

The twenty rows, in grid order:

| Group | `key` | Label | Description |
|---|---|---|---|
| Dashboard | `dashboard.view` | Dashboard | See sales, fulfilment and buyer trends on the home page. |
| Purchase orders | `po.view` | Purchase orders | Open the order list and any order's detail, document and download. |
| | `po.upload` | Upload a purchase order | Upload a PO for auto extraction |
| | `po.review` | Review an extracted order | Correct Claude's reading on the review screen and save a draft. |
| | `po.confirm` | Confirm or decline an order | Turn a draft or a shop order into a live purchase order, or decline it. |
| | `po.edit` | Edit a purchase order | Change PO date, expected delivery, payment terms and the remark. |
| | `po.delete` | Delete a purchase order | Remove an order permanently. Cannot be undone. |
| Fulfilment | `po.advance.order_placed` | Advance: Order placed → In production | Start production on an order the team has confirmed. |
| | `po.advance.in_production` | Advance: In production → QC passed | Sign off quality control on a finished batch. |
| | `po.advance.qc_passed` | Advance: QC passed → In warehouse | Book a passed batch into the warehouse. |
| | `po.advance.in_warehouse` | Advance: In warehouse → Delivering | Release a warehoused order to the carrier. |
| | `po.advance.delivering` | Advance: Delivering → Delivered | Mark a delivery as received by the buyer. |
| | `po.revert` | Move an order back a stage | Undo a stage move. Always asks for a reason and records it. |
| Catalogue | `product.view` | Products | Browse the catalogue, product pages and their order history. |
| | `product.manage` | Manage products | Add, edit, publish, image and delete catalogue products. |
| Buyers | `buyer.view` | Buyers | Browse the buyer roster and each buyer's orders and trends. |
| | `buyer.manage` | Manage buyers | Add, edit and delete buyers, their contacts and shop logins. |
| Administration | `user.manage` 🔒 | Manage users | Add, edit, disable and delete portal users and set their role. |
| | `permission.manage` 🔒 | Manage permissions | Change this grid — who may do what. |
| | `org.settings` 🔒 | Company details | Edit the supplier name, address and contact shown to buyers. |

The five advance keys are named for the stage they move **from**, so the key
for a given order is derived from the row the server just read:
`` `po.advance.${po.stage.toLowerCase()}` ``. `DELIVERED` has no key, because
`nextStage` returns null there and the action already refuses.

**There is no separate key for leaving a note on an advance.** A note rides
on whichever advance grant the role holds; granting advance-without-note is
not a distinction this product draws.

## 5. Default grants

Seeded by the second migration. `✓` = granted.

| Action | Super admin | Planner | QC | Warehouse | Member |
|---|:--:|:--:|:--:|:--:|:--:|
| `dashboard.view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `po.view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `po.upload` | ✓ | ✓ | ✓ | ✓ | |
| `po.review` | ✓ | | | | |
| `po.confirm` | ✓ | | | | |
| `po.edit` | ✓ | | | | |
| `po.delete` | ✓ | | | | |
| `po.advance.order_placed` | ✓ | ✓ | | | |
| `po.advance.in_production` | ✓ | | ✓ | | |
| `po.advance.qc_passed` | ✓ | | | ✓ | |
| `po.advance.in_warehouse` | ✓ | | | ✓ | |
| `po.advance.delivering` | ✓ | | | ✓ | |
| `po.revert` | ✓ | | | | |
| `product.view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `product.manage` | ✓ | | | | |
| `buyer.view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `buyer.manage` | ✓ | | | | |
| `user.manage` | ✓ | | | | |
| `permission.manage` | ✓ | | | | |
| `org.settings` | ✓ | | | | |

The advance rows reproduce the stage table exactly: Planner owns the first
move, QC the second, Warehouse the last three, and only a super admin moves
an order back.

`po.upload` is granted to all four working roles and withheld from `MEMBER`,
which is the view-only role. Every cell above is a default; the point of the
grid is that they can be changed.

## 6. Enforcement

`src/lib/permissions/require.ts`, server-only.

```ts
/** One query per request for the viewer's own role. React cache() dedupes. */
export const loadGrants = cache(async (role: Role): Promise<ReadonlySet<string>> => …);

export async function can(key: PermissionKey): Promise<boolean>;
export async function requirePermission(key: PermissionKey): Promise<SessionUser>;
```

`can()` short-circuits twice before it reads anything:

- `CLIENT` → `false`. A shop account is not an ops account, whatever the
  table says.
- `SUPER_ADMIN` → `true`. **This is the lock-out guarantee.** It is stronger
  than disabling the column in the grid, because no saved edit, no direct SQL
  write and no corrupt row can take the portal away from its administrators.
  The stored `SUPER_ADMIN` rows exist so the grid reads from one source; the
  runtime never depends on them.

`requirePermission` throws `UnauthorizedError` — the class every action file's
local `guard()` already catches and turns into `{ success: false, error }`.
Nothing about the action result envelope changes.

### Caching

**Per-request memo only. No cross-request cache.** One indexed read of at
most twenty rows for the viewer's single role. There is nothing to
invalidate, a saved grid is live on the very next request, and changing it
needs no deploy — which is the strictest available reading of the brief's
"cache OK, invalidate on save".

### Where it is applied

Server actions keep returning the refusal in their result envelope; the API
routes return a real **403** with JSON, matching the shape those routes
already use for their super-admin refusal.

| Key | Guards |
|---|---|
| `po.upload` | `/upload`, `/api/upload/presign`, `/api/upload/complete`, `DELETE /api/upload/[documentId]`, `deleteUpload`, `getExtractionStatus` |
| `po.review` | `/review/[id]`, `saveDraft`, `checkDuplicate`, `retryExtraction`, `discardExtraction` |
| `po.confirm` | `confirmPurchaseOrder`, `confirmWebOrder`, `declineWebOrder` |
| `po.edit` | `updatePurchaseOrder` |
| `po.delete` | `deletePurchaseOrder`, `deleteWebOrder` |
| `po.advance.*` | `advanceStage`, keyed on the stage it just read |
| `po.revert` | `revertStage` |
| `po.view` | `/purchase-orders`, `/purchase-orders/[id]`, `/web-orders/[id]`, `/api/documents/[id]/url`, `/api/review-queue/count` |
| `product.manage` | every export of `src/actions/products.ts`, both product-image API routes |
| `buyer.manage` | `updateBuyer` (whole row, not just `name`) |
| `user.manage` | every export of `src/actions/users.ts`, `src/actions/reset-links.ts` |
| `org.settings` | `updateSupplierDetails` |
| `permission.manage` | `updatePermissions` |

`getExtractionStatus` sits under `po.upload`, not `po.review`: it is what the
upload queue polls to turn a row from "Extracting" into "Ready", so a role
that may upload must be able to watch its own upload finish. It reads a
status and a failure reason, never the extracted draft.

Two inline role comparisons are absorbed and deleted:
`src/actions/stages.ts:157` (`revertStage`) and `src/actions/buyers.ts:62`
(which gated only the `name` field of `updateBuyer`). Neither is findable by
grepping `requireSuperAdmin`, which is why they are named here.

`src/actions/profile.ts` (`updateProfile`, avatars, `signOutEverywhere`) and
`changePassword` stay on `requireUser` / `requireAccount`. They are
self-scoped; a role never governs whether you may change your own password.

`writePurchaseOrder` (`purchase-orders.ts:198`) stays unguarded and stays
exported: it takes an open Prisma transaction and is called only from within
already-guarded actions. Its doc comment is extended to say so explicitly.

### Advance is keyed on the row, not the request

`advanceStage` reads the purchase order first and derives its key from
`po.stage`. A planner who forges a request against a QC-passed order is
refused by the same code path that hides their button, because the key is
computed from the database row rather than from anything the caller sent.

## 7. The `/admin` rule

**Everything under `/admin` is super-admin-only, structurally.** The three
Administration rows render in the grid with a lock and are not editable;
`updatePermissions` refuses a patch that names them.

The reason is `src/proxy.ts`. It is built from `auth.config.ts` and
**deliberately imports no Prisma** — it reads a JWT and cannot consult the
grid. Line 132 rewrites `/admin` to a pinned 404 for anyone who is not a
super admin, with the comment *"404, never 403: a member must not learn that
/admin is a real route."* Making the Administration rows editable would mean
one of:

- the proxy stops gating `/admin` and `(admin)/layout.tsx` calls
  `notFound()` instead — which loses the pinned **status**, because a
  `notFound()` from a streaming layout answers 200 with the right body, the
  app-wide gap recorded on 2026-09-10 and again in Phase 25; or
- the grid offers a cell the running system ignores, which is worse than not
  offering it.

Locking costs nothing today: all three are `F — — — —` in the brief's own
matrix. `/admin/catalogue` (labels, families) is inside `/admin` and so stays
super-admin-only too, while `product.manage` governs the portal's own product
screens (`/products/new`, the product drawer), which are configurable.

**Known limit, recorded rather than fixed:** granting buyer or user
management to a non-super-admin means first moving those screens out of
`/admin` or teaching the proxy to read the grid. Neither is in this phase.

## 8. Screens

### The grid

A section on `/admin`, below the users table and the pending-requests block,
under its own `h2` — the page the brief asked for.

- Rows grouped by `PermissionGroup` with a group heading; first column is the
  `label` with `description` as caption text beneath it, in the muted ink the
  design system already uses for table captions.
- Five columns, one per assignable ops role. Cells are checkboxes. The
  `SUPER_ADMIN` column renders checked and disabled, with a title explaining
  it cannot be changed. Locked rows render their whole row disabled.
- **Save is explicit**, with dirty tracking and a count ("3 changes"), not
  save-on-toggle. A hundred cells autosaving would be a hundred round trips
  with no undo.
- Below `md` a five-wide grid gives about 70px a column, under the 44px touch
  floor the 2026-09-06 mobile pass set. The phone therefore renders a
  `SegmentGroup` role picker and the twenty checkboxes for that one role.

`updatePermissions(changes: { role, action, granted }[])` writes one
transaction and one `PERMISSIONS_CHANGED` audit row whose `detail` holds the
changed cells — keys and booleans, never a user's data. It refuses any change
naming `SUPER_ADMIN` or a locked row, and any `action` outside the registry.

### Users

- `userRoleSchema` grows from `[MEMBER, SUPER_ADMIN]` to the five ops roles.
  `CLIENT` stays deliberately absent; the schema is what keeps a customer
  from being promoted to staff from the admin room.
- `listUsers()` widens its `where: { role: { in: [...] } }` to the same five.
- The role column, the drawer's `<select>` and the access-request approval
  picker all offer five, through one `roleLabel()` helper so the spellings
  cannot drift.
- **The last-super-admin rule needs no new code.** `isLastSuperAdmin` at
  `users.ts:59` already covers demote, disable and delete, and `demoting` is
  computed from the role changing away from `SUPER_ADMIN`, so demotion to any
  of the three new roles trips it. It gains a test, not a change.

### Purchase order detail

`LifecycleActions` takes `canAdvance: boolean` and `advanceBlockedReason:
string | null` beside the existing `canMoveBack`. When the viewer does not
own the current stage the Advance button renders **disabled with a short
reason** — "QC advances this stage" — rather than vanishing, because a
missing button reads as a broken page when the same button was there
yesterday on a different order.

Admin-shaped actions **hide**: Confirm, Decline, Edit, Delete, Upload, and
the product and buyer add/edit/delete controls.

### Navigation

`NAV` is unchanged and ungated — Dashboard, Purchase Orders, Buyers and
Products are visible to all five ops roles. The Admin row in `UserMenu` is
already gated on `isSuperAdmin` and stays as it is.

## 9. What narrows on deploy

Stated plainly, because these are powers the team has today:

- **Confirming and declining** a purchase order or a shop order becomes super
  admin only. Any `MEMBER` can do it now.
- **Editing a purchase order's header** becomes super admin only.
- **Editing a buyer** becomes super admin only; today a member may edit every
  field but `name`.
- **Advancing a stage** becomes stage-scoped. A `MEMBER` who advances orders
  today will find every Advance button disabled until a super admin gives
  them a working role.
- **The review screen** becomes super admin only. Uploading does not.

Nobody's access widens. The team needs telling before this deploys, rather
than discovering a disabled button.

**Production note.** Vercel's preview builds run `prisma migrate deploy`
against the production database (recorded in Phase 41; `vercel.json` was
changed on 2026-09-17 to gate it on `VERCEL_ENV`, which has not yet been
watched on a real deploy). Pushing this branch may therefore add the enum
values and the table to production before review. Both migrations are
additive and the pre-phase code ignores them, so the running site is
unaffected until the application code merges.

## 10. Testing

- **The stage table is a literal fixture.** A table-driven test walks all
  five ops roles against all twenty keys and asserts the seeded defaults,
  with the five advance rows written out as the brief wrote them.
- **A refusal test per newly gated action**, each **watched failing** with
  the guard removed before it is trusted to pass. Phases 16, 23 and 41 each
  shipped a test that passed by asserting its own mock; the convention exists
  because of them.
- `can()` returns false for `CLIENT` and true for `SUPER_ADMIN` **without
  reading the table** — asserted by giving the mock a table that denies
  everything.
- `advanceStage` derives its key from the stored stage: a planner is refused
  on a `QC_PASSED` order and allowed on an `ORDER_PLACED` one.
- `updatePermissions` refuses a `SUPER_ADMIN` cell, a locked row and an
  unknown action key.
- Demoting the last super admin to `WAREHOUSE` is refused.

## 11. Files

New
: `prisma/migrations/20260920090000_roles_and_permission_grants/`,
  `prisma/migrations/20260920090100_permission_grant_defaults/`,
  `src/lib/permissions/actions.ts`, `src/lib/permissions/defaults.ts`,
  `src/lib/permissions/require.ts`, `src/lib/permissions/roles.ts`
  (`roleLabel`, the assignable list), `src/actions/permissions.ts`,
  `src/components/admin/PermissionGrid.tsx`, plus a test beside each.

Changed
: `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/validation/users.ts`,
  `src/lib/queries/users.ts`, `src/components/admin/UsersTable.tsx`,
  `src/components/admin/UserDrawer.tsx`,
  `src/components/admin/PendingRequests.tsx`,
  `src/app/(admin)/admin/page.tsx`,
  `src/components/purchase-orders/LifecycleActions.tsx`,
  `src/app/(portal)/purchase-orders/[id]/page.tsx`,
  `src/app/(portal)/purchase-orders/page.tsx`,
  `src/app/(portal)/web-orders/[id]/page.tsx`,
  `src/app/(portal)/review/[id]/page.tsx`, `src/app/(portal)/upload/page.tsx`,
  `src/actions/stages.ts`, `src/actions/purchase-orders.ts`,
  `src/actions/web-orders.ts`, `src/actions/products.ts`,
  `src/actions/buyers.ts`, `src/actions/users.ts`,
  `src/actions/reset-links.ts`, `src/actions/org-settings.ts`,
  `src/actions/product-families.ts`, `src/actions/catalog-labels.ts`,
  `src/actions/admin-buyers.ts`, `src/actions/clients.ts`,
  and the eleven route handlers under `src/app/api/`.

Unchanged, on purpose
: `src/proxy.ts` (but see §7), `src/lib/auth.ts`, `src/lib/auth.config.ts`,
  `src/actions/cart.ts`, `src/actions/shop-public.ts`, everything under
  `src/app/(storefront)/`, `src/actions/profile.ts`, `src/actions/auth.ts`.

## 12. Acceptance criteria

1. Five ops roles exist, are assignable from the user drawer, and show in the
   users table's Role column.
2. A user in each role sees the Advance button enabled on exactly the stages
   §5 grants them, and disabled with a reason on every other stage.
3. A forged server-action call to advance a stage the role does not own is
   refused by the server, proven by a test that calls the action directly.
4. Move back is offered to super admins only and refused server-side for
   everyone else.
5. A super admin edits a cell in the grid, saves, and the change takes effect
   on the next request with no deploy and no restart.
6. The `SUPER_ADMIN` column and the three Administration rows cannot be
   changed, from the UI or by calling the action directly.
7. A non-super-admin gets a 404 on `/admin` and cannot read the grid.
8. The last active super admin cannot be demoted to any of the new roles,
   disabled, or deleted.
9. `/admin` and the grid have no horizontal overflow at 390, 768 and 1440,
   and every control clears 44px at 390.
10. The whole suite, `tsc --noEmit`, `npm run lint` and `npm run build` are
    clean.

## 13. Verified, with the figures

Development, port 3000, against four throwaway users — one per working role
and one `MEMBER` — signing in for real and carrying real sessions. Baseline
before: users **2**, grants **100**, purchase orders **400**, stage events
**2323**, audit rows **5**, login attempts **68**.

- **The stage table holds, all twenty cells**, read from the server with each
  role's own session against one real order at each of the five advanceable
  stages (`PO-2026-0025`, `-0063`, `-0061`, `-0062`, `-0059`):

  | From | Planner | QC | Warehouse | Member |
  |---|---|---|---|---|
  | Order placed | **true** | false | false | false |
  | In production | false | **true** | false | false |
  | QC passed | false | false | **true** | false |
  | In warehouse | false | false | **true** | false |
  | Delivering | false | false | **true** | false |

- **The server refuses, not just the button.** A planner calling
  `advanceStage` against the QC-passed `PO-2026-0061` — through a temporary
  route handler holding their real session, because a crafted Server-Action
  POST is not a valid probe (Phases 40, 41) — got
  `{ success: false, error: "Warehouse advances this stage." }` with
  `stageAfter: QC_PASSED`, unchanged. The warehouse role on the same order
  got `{ success: true, data: { stage: "IN_WAREHOUSE" } }`.
- **A grid change is live with no deploy and no restart.** With the dev server
  untouched, `po.advance.qc_passed` for Planner went false → **true** → false
  across three consecutive requests, the middle one after the grant alone.
- **A save from the grid reaches the running app.** Turning `po.upload` off
  for QC and `po.edit` on for Member in the browser and pressing Save wrote
  both rows (`updatedById` set to the acting super admin) and **one**
  `PERMISSIONS_CHANGED` audit row with `buyerId: null` and a `detail` of keys
  and booleans only. QC's `/upload` then read "Page not found" with no upload
  controls, and Member's PO detail gained the Edit control — both on the next
  request. Reverted through the grid the same way.
- **`/admin` is 404** for all four roles, read with
  `curl -o /dev/null -w '%{http_code}'`: **404, 404, 404, 404**.
- **The portal hides what it should.** On `PO-2026-0061`, all four roles saw
  **no** Edit, **no** Delete and **no** Move back. The planner's Advance
  rendered `disabled` with the caption "Warehouse advances this stage."; the
  warehouse role's rendered live, with neither the disabled attribute nor the
  caption.
- **The review screen refuses.** `/review/[id]` as the planner returned "Page
  not found" with no "Confirm & save" and no line items.
- **The grid.** 20 rows in 6 groups × 5 columns; all 20 super-admin cells
  checked **and** disabled; all three Administration rows disabled across every
  role; Save disabled at rest, reading "Save 2 changes" after two toggles, with
  a Discard beside it. The roster reads all six users with the labels Super
  admin, Production planner, QC, Warehouse and Member.
- **Sweep:** `/admin` at 390 / 768 / 1440 — `scrollWidth === innerWidth` on all
  three. At 390 the grid is in role-picker mode with **20** visible checkboxes,
  **0** touch targets under 44px, and all five role buttons 44px tall. 100
  visible checkboxes at 768 and 1440.
- **Cleanup, counted both ends.** Four users, four login attempts and two
  audit rows deleted **by id**; every grant reset to its default with
  `updatedById` cleared; the one stage event the live advance wrote deleted and
  `PO-2026-0061` restored to `QC_PASSED`. Counts back to users **2**, grants
  **100** (0 off default, 0 still stamped), purchase orders **400**, stage
  events **2323**, audits **5**, login attempts **68**. The probe route and
  every temporary script were removed.
- **1304/1304 tests across 100 files**, `tsc --noEmit`, `npm run lint` (the
  same 2 pre-existing warnings, 0 errors) and `npm run build` all clean.

**Guards watched failing before they were trusted.** Removing the super-admin
short circuit failed the lock-out test; removing `advanceStage`'s permission
call failed nine tests; swapping `po.confirm` for `po.view` failed the two
key-pinning tests; deleting either refusal in `updatePermissions` failed three.
The stage table itself was watched catching a misassigned stage in both
directions.

## 14. Not verified

- **Anything on production.** No production database was read or written and
  no production screen was opened.
- **The status code on `/upload` and `/review/[id]`.** Both answer **200** with
  the "Page not found" body and none of the screen's content — the app-wide
  streaming-layout gap recorded on 2026-09-10 and again in Phase 25, not
  something this phase introduced. `/admin` keeps a real 404 because the proxy
  pins it with a rewrite. Content is correct everywhere; only the status is
  wrong on the two page-level guards.
- **A Google access request approved into one of the new roles.** The picker
  offers all five and `approveAccessRequest` refuses CLIENT as before, but no
  request was approved live.
- **Two super admins saving the grid at once.** The last write wins per cell;
  there is no optimistic-concurrency guard on `PermissionGrant`, by design.
- **The phone grid's save path**, driven only at desktop width. The same
  component and action serve both.
- **`rolesWithPermission` naming two roles at once** — no stage is owned by
  more than one role under the defaults, so the "Planner or QC advances this
  stage." wording is covered by unit tests only.

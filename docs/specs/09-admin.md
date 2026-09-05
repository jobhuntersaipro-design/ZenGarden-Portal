# Phase 09 — Admin

Branch `feature/admin`. Depends on: 02 (auth, emails) and 05 (tables).
Screen: design reference §3.7.

Goal: super admins manage users and approve access requests at `/admin`,
which is invisible to everyone else.

## 1. Shell

`src/app/(admin)/admin/layout.tsx`: 60px top bar (wordmark, hairline, "Admin"
mono label — mono, tertiary, not uppercased (G3), "‹ Back to portal", avatar), content column 1160px narrowing to
920px while the drawer is open (`?user=<id>|new` opens it). The proxy from
Phase 02 already 404s non-super-admins; the layout calls
`requireSuperAdmin()` too.

## 2. Pending access requests

`listAccessRequests(PENDING)` newest first; hidden when empty. The row's role
picker and the Approve / Decline pair stay exactly as specified below —
nothing about this flow changes. The **Pending** badge is neutral text
(`ink-secondary`) inside an amber ring (`brand-amber` border, no amber fill or
amber text): pending access is a waiting state, deliberately distinct from the
amber-text "Needs review" badge used for work in the PO queue (G2). Row per
request with a role select and:

- `approveAccessRequest(id, role)`: transaction creates `User` from the
  request (email, name, image, role, no password), marks the request
  `APPROVED` with `decidedById/At`, sends `AccessApproved`. If a `User` with
  that email already exists, just mark approved.
- `declineAccessRequest(id, notify: boolean)`: marks `DECLINED`, optionally
  sends `AccessDeclined`. Declined requests stay in the table for audit and
  are hidden from the list; a fresh sign-in by that email shows the declined
  copy (Phase 02) without creating a new request.

## 3. Users table

`?q=&status=all|active|invited|disabled&sort=&dir=&page=&size=` on
`DataTable`. Status derivation: `disabledAt` → Disabled; no `passwordHash`
and no `Account` and `lastActiveAt` null → Invited; else Active. The
**Invited** badge, like Pending above, is neutral `ink-secondary` text inside
an amber ring — not amber text. Columns per §3.7; "Edit" opens the drawer.

**Reset password depends on whether the user has one.** A row with a
`passwordHash` shows "Reset password", which opens a small `Dialog` "Email a
reset link to priya@…?" calling `requestPasswordReset` from Phase 02 (rate
limit applies). A row with `passwordHash = null` (Google-only) shows the
static text **"Password managed by Google"** in `ink-tertiary` in place of the
action, with a `title` explaining it — "This user signs in with Google; there
is no password to reset. Set one in the drawer if they need email sign-in." —
and offers no reset link to click.

## 4. Drawer — `UserDrawer` (`Sheet`, 440px)

Fields per §3.7. Actions in `src/actions/users.ts`, all `requireSuperAdmin`,
Zod in `src/lib/validation/users.ts`:

- `createUser({ name, email, role, password?, mustChangePassword })`: email
  unique (case-insensitive); with password → bcrypt, show it once in the
  drawer's success state and send `TemporaryPassword`; without → plain row,
  toast "They can sign in with Google now".
- `updateUser(id, { name, email, role, active })`: rules — cannot demote or
  disable yourself; cannot demote or disable the last active SUPER_ADMIN;
  disabling sets `disabledAt` and increments `sessionVersion` so the Phase 02
  JWT refresh cuts the session.
- `setPassword(id, password, mustChange)`: bcrypt cost 12; deletes the user's
  `PasswordResetToken`s; increments `sessionVersion` so every existing session
  ends at its next JWT refresh (Phase 02 compares it).
- `deleteUser(id)`: confirm dialog copy from §3.7, **gated on typing the
  user's email**. The dialog holds an input and the caption "Type
  priya@zengarden.my to confirm"; the Delete button stays `disabled` until the
  typed string matches the user's email exactly (trimmed, case-insensitive
  compare on the address; no partial or paste-around shortcut). Cannot delete
  yourself or the last super admin. Deletion is a soft delete: set `disabledAt`, blank
  `passwordHash`, rename to "Deleted user", keep the row so uploads and
  stage events stay attributed. Real row deletion is not offered.

## 5. Tests

Vitest for the user rules (self-demote, last super admin, invited status
derivation) with a mocked Prisma; Zod schema tests. Playwright: approve a
seeded pending request and sign in as that user.

## 6. Acceptance criteria

1. `/admin` is a 404 for members and signed-out visitors; super admins see it.
2. A pending request appears within seconds of a stranger's Google sign-in;
   Approve creates the user, emails them, and their next Google sign-in works.
3. Creating a user with a password shows it once and emails it; that user is
   forced to change it on first sign-in.
4. The last super admin cannot be demoted, disabled or deleted; you cannot
   act on yourself.
5. Disabling a user ends their session within 5 minutes; setting a password
   ends it immediately.
6. Users table filters and sorts; the drawer narrows the content column without overlap.
7. The delete dialog's Delete button is disabled until the user's email is
   typed exactly; a near-miss ("priya@zengarden.m") leaves it disabled, and
   the caption names the address to type.
8. A Google-only user's row shows "Password managed by Google" with an
   explanatory `title` and no reset action; a user with a password still shows
   "Reset password" and the dialog sends the link.
9. Invited and Pending badges render as neutral text inside an amber ring,
   visibly different from the amber-text "Needs review" badge on the PO list.
10. Table column headers and field labels are mono and not uppercased (G3).

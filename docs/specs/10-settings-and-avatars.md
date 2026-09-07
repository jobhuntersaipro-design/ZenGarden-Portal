# Phase 10 — Account settings and person avatars

Branch `feature/settings-and-avatars`. Depends on: 02 (auth, password change,
`sessionVersion`), 03 (R2 upload patterns), 05 (PO detail and Activity),
09 (admin users table, `initials` duplication).

Goal: a signed-in person can manage their own account at `/settings` — picture,
display name, password, sessions — and every place the portal names a person
shows that person's picture beside the name.

This phase adds no new nav row. Settings is reached from the account menu in
the sidebar footer and the mobile top bar; the master spec §4 rule that
navigation is destinations only still holds.

## 1. Data model

Two columns on `User`, one migration:

```prisma
avatarKey         String?    // R2 object key for the stored picture; null = none
avatarStyle       String?    // DiceBear style id when the picture was generated
avatarSeed        String?    // the seed that generated it
passwordChangedAt DateTime?  // null = never changed since the row was created
```

`avatarStyle` and `avatarSeed` are **not** how an avatar is served — §2 covers
that. They exist so the picker can show which style is currently selected and
re-render it, and they are null for an uploaded photo.

`User.image` keeps its existing contract: **a URL, whatever its source.** It is
never an R2 key. Three cases:

| Case | `image` | `avatarKey` | `avatarStyle` / `avatarSeed` |
|---|---|---|---|
| Uploaded photo | `/api/avatars/{userId}?v={hash}` | `avatars/{userId}/{hash}.webp` | `null` |
| Generated avatar | `/api/avatars/{userId}?v={hash}` | `avatars/{userId}/{hash}.webp` | set |
| Google photo | `https://lh3.googleusercontent.com/…` | `null` | `null` |
| Initials only | `null` | `null` | `null` |

A generated avatar and an uploaded photo are indistinguishable to everything
downstream: both are a 256×256 WebP in R2 behind the same URL. Only the picker
in §5 cares which is which.

This is the load-bearing decision of the phase. Every existing render site —
`Sidebar`/`UserMenu`, `MobileTopBar`, the admin layout, `PoTable`,
`UsersTable`, `signin/pending` — already treats `image` as a URL handed to
`<AvatarImage src>`, so none of them need to know an avatar store exists.

`{hash}` is the first 12 hex characters of the SHA-256 of the stored WebP
bytes. It appears in both the key and the URL so that a replaced picture is a
different URL, which is what makes the immutable cache header in §2 safe.

**Google will not overwrite an uploaded picture.** `resolveGoogleSignIn`
(`src/lib/auth-access.ts`) writes `image` only inside `prisma.user.create` and
on the `AccessRequest` row — never on an existing `User`. Verify at
implementation time that `PrismaAdapter` does not update `image` on
`linkAccount`; if it does, the fix is to null it out in the adapter's
`updateUser`, not to change the column contract.

`passwordChangedAt` means exactly one thing: **when `passwordHash` was last
written**, by whoever wrote it. It is set at all four existing sites that write
a hash — `changePassword` and `resetPassword` in `src/actions/auth.ts`,
`createUser` and `setPassword` in `src/actions/users.ts` — and is *not* touched
by `deleteUser`, which clears the hash rather than setting one. Nothing reads it
but §4's Security card. A row that predates the migration reads `null` and the
card says "Never changed".

## 2. The avatar pipeline

There are two ways a picture gets into R2 — an uploaded photo (below) and a
generated avatar (§3). Both converge on the same 256×256 WebP, the same object
key and the same serve route, so everything after the first step is shared.

### Upload — `POST /api/avatars`

A route handler, not a Server Action: Server Actions cap request bodies at 1 MB
by default and a phone photo exceeds that before it is resized. This is also
what `context/coding-standard.md` prescribes for file uploads.

`requireUser()`, then multipart `FormData` with one `file` part. Validation in
`src/lib/validation/profile.ts`:

- type `image/png`, `image/jpeg`, `image/webp` — rejected by the declared type
  *and* by what `sharp` reports after reading the bytes, because a declared
  type only proves what the client claimed
- size ≤ 5 MB before resize
- dimensions ≤ 8000px on a side, rejected with a plain-language reason

`sharp` (already a direct dependency) resizes to **256×256, `fit: "cover"`,
WebP quality 82** — one size, no 2×; the largest render is 96px in the profile
card and a 256px source covers a 2× display of it. The result is PUT to R2
server-side through the existing `r2` client (no presign: the server holds the
bytes), then `avatarKey` and `image` are updated in one write.

Replacing a picture deletes the previous object **after** the row update
commits, and a failed delete is logged rather than surfaced — an orphaned
256px WebP is cheaper than a failed save.

Returns `{ url }`. Errors return `{ error }` with a sentence the form shows
verbatim, matching the upload queue's plain-language failure style from Phase 03.

### Serve — `GET /api/avatars/[userId]`

`requireUser()` — the portal has no anonymous surface, so avatars are not
public. Looks up `avatarKey`; 404 when null. Streams the R2 object with:

```
Content-Type: image/webp
Cache-Control: private, max-age=31536000, immutable
```

Immutable is safe only because of the `?v={hash}` in the URL: a changed picture
is a different URL, so nothing stale can be served. The `private` keyword keeps
shared caches out of it.

An R2 `NoSuchKey` returns 404, not 500 — the same condition the seeded
documents already produce, and the fallback initials are the correct response.

### Remove

`removeAvatar()` clears `avatarKey`, sets `image = null`, deletes the object.
This falls back to **initials** for everyone, including a Google user.

**There is no "Use my Google photo".** It was built, then removed on
2026-09-07 at the user's instruction. It cannot work without somewhere to keep
the Google URL: `image` is overwritten the moment someone uploads a photo or
picks a generated avatar, and the Google picture is written only when the row
is created — `resolveGoogleSignIn` deliberately does not touch `image` on
subsequent sign-ins, so an uploaded avatar survives. The linked `Account` row
stores tokens, not a picture. A button that could never restore anything is
worse than no button, so both went. Reinstating it means a column to hold the
Google URL, which is a spec decision, not a silent edit.

## 3. Generated avatars — DiceBear

Rendered **locally**. `@dicebear/core` (MIT) and `@dicebear/styles` are added as
dependencies and `api.dicebear.com` is never called at runtime — not for a
render and not for a picker preview. Three reasons, all checked rather than
assumed: the API can be down or rate-limit; seeds are user names, and hot-linking
would tell a third party who the staff are; and three of the five styles below
are **absent from the public API's own `/10.x` index** while shipping perfectly
well in npm, so those endpoints are unlisted and could move without notice.

### The five styles

`src/lib/avatar-styles.ts` imports exactly five definitions, so the bundler
drops the other 56 in the package:

| Id | Reads as | Licence |
|---|---|---|
| `gaze` | abstract geometric shape | CC0 1.0 |
| `voxel-bot` | blocky 3D robot | CC0 1.0 |
| `clay` | soft 3D clay render | CC0 1.0 |
| `croodles` | hand-drawn doodle face | **CC BY 4.0**, vijay verma |
| `notionists` | hand-drawn person | CC0 1.0 |

**`croodles` obliges attribution.** A single line of `text-ink-tertiary`
`text-caption` sits under the style picker — "Croodles by vijay verma · CC BY
4.0", the name linking to the creator's page. It appears where avatars are
chosen; it is not required on every page that renders one. If croodles is ever
dropped, drop the line with it.

### Rendering

```ts
import { Avatar, Style } from "@dicebear/core";
import gaze from "@dicebear/styles/gaze.json" with { type: "json" };

const style = new Style(gaze);              // module scope, built once
new Avatar(style, {
  seed,
  size: 256,
  animationVariant: ["none"],
}).toString();
```

Two rules, both taken from the shipped type definitions rather than the docs
site:

- **Always wrap the definition in `new Style(...)` and reuse the instance.**
  Passing a raw definition straight to `Avatar` is deprecated in 10.7.0 and is
  removed in v11. One `Style` per style id at module scope, never per request.
- **`animationVariant` is pinned to `["none"]`.** `gaze`, `voxel-bot` and `clay`
  carry `@keyframes` in their definitions; since the SVG is rasterized, an
  animation left free means `sharp` captures an arbitrary frame. It also keeps
  avatars still in a dense table, which is what the `prefers-reduced-motion`
  rule in the master spec would demand anyway. A measured render with no options
  already comes out static, so this pin is belt-and-braces rather than a fix —
  but it is the difference between static by accident and static by contract.

`gaze` additionally pins `shapeVariant` to the seven geometric variants —
`circle`, `square`, `triangle`, `pentagon`, `hexagon`, `octagon`, `diamond` —
omitting the `pill`, `column`, `egg` and `arch` the style also ships.

**Option names are `` `${component}Variant` ``**, not the bare component name.
The components in `gaze.json` are called `shape` and `animation`, but passing
`{ shape: [...] }` throws `OptionsValidationError: /shape has an unexpected
property`. This was found by running it, not by reading the docs.

### Seeds

The seed defaults to the user's display name, so a first look at the picker
shows something already personal. **Shuffle** replaces it with a fresh
`randomUUID()`. The picker renders six seed variants per style as inline
`toDataUri()` SVGs — no network, no R2 write — and nothing is stored until a
variant is chosen.

On choose: render at 256, rasterize through the same `sharp` step as §2, store
in R2, and record `avatarStyle` and `avatarSeed` alongside `avatarKey`.

## 4. `PersonChip` and the sweep

`initials()` is copy-pasted **four** times identically — `UserMenu`,
`UsersTable`, `PoTable` and the admin layout — and a fifth time in
`ProductThumb`, which runs the same algorithm over a product name rather than a
person's. All five move to `src/lib/avatar.ts`, alongside
`avatarObjectKey(userId, hash)` and `avatarUrl(userId, hash)`.

`signin/pending` also has something called `initials`, but it is a **different
function** — `email.slice(0, 2).toUpperCase()`, a monogram for an address
belonging to someone who has no `User` row yet. It is left alone.

`src/components/ui/person.tsx` exports `PersonChip`:

```tsx
<PersonChip name={string | null} image={string | null} size="sm" | "md" | "lg" />
```

- sizes 24 / 32 / 96px, matching the three that exist today
- the name truncates and always carries a `title` with the full value
  (master spec §4, truncation always has a way back)
- `name = null` renders the caller's fallback — `PoTable` keeps its
  "Not confirmed" in `ink-disabled`, which is deliberate and stays
- **`"System"` is not a person.** It renders a neutral `Cog` glyph
  (`lucide-react`) on `surface-soft`, never initials, so an automated lifecycle
  event is not mistaken for a colleague's action

`ProductThumb` keeps its own initials-of-a-product-name logic and does **not**
adopt `PersonChip`; it shares only the `initials` helper.

Sites gaining an avatar:

| Site | File |
|---|---|
| Activity card — every event actor, and the Confirmed row | `src/components/purchase-orders/ActivityList.tsx` |
| "Confirmed by" in the details card | `src/app/(portal)/purchase-orders/[id]/page.tsx` |
| "Moved here by" in the Lifecycle card | `src/app/(portal)/purchase-orders/[id]/page.tsx` |

Sites retrofitted onto `PersonChip` so the sizes cannot drift: `PoTable`,
`UsersTable`, `UserMenu` and the admin layout.

Two queries in `purchase-orders/[id]/page.tsx` select `{ name: true }` and must
select `{ name: true, image: true }`: `confirmedBy` (line ~57) and the stage
events' `changedBy` (line ~64). `ActivityEvent` gains `changedByImage`.

The "Uploaded by" filter in `PoFilters` is a native `<select>` and **does not**
get avatars — an `<option>` cannot contain an image. Left as is rather than
rebuilt into a combobox for this phase.

## 5. `/settings`

`src/app/(portal)/settings/page.tsx` plus `loading.tsx`, inside the portal
shell. One column, two cards, `max-w-[var(--container-page)]` as every portal
page. Page header "Settings", no primary action in the header — each card owns
its own save, so the one-`button-primary`-per-screen rule is satisfied by the
Profile card's Save.

### Profile card

| Field | Behaviour |
|---|---|
| Picture | See the picker below |
| Display name | Text input, 1–80 characters after trim, required |
| Email | Read-only, with the reason underneath: "Your email is how you sign in and how your admin finds you. Ask a super admin to change it." |
| Role | Read-only line, "Member" or "Super admin" |
| Member since | Read-only, `formatDate(createdAt)` |

#### The picture picker

One control, four sources, in this order:

```
Picture

   ( 96px preview )   [ Upload a photo ]  [ Remove ]

   Or choose a style
   [ gaze ] [ voxel-bot ] [ clay ] [ croodles ] [ notionists ]

   ( six seed variants of the selected style )        [ Shuffle ]

   Croodles by vijay verma · CC BY 4.0
```

- **Upload a photo** goes through §2, with a spinner on the button. No progress
  bar: a 5 MB cap and one round trip does not need one.
- **The style row** selects a style; the six variants below re-render inline
  from `toDataUri()` with no network and no write. Nothing is stored until a
  variant is clicked. The currently-saved variant is marked selected, which is
  what `avatarStyle`/`avatarSeed` are for.
- **Remove** falls back to initials.

The variant grid is a radio group, not a row of buttons — arrow keys move
between variants and each carries an `aria-label` naming its style, since the
images themselves are decorative and convey nothing to a screen reader.

Save calls `updateProfile({ name })` and then `useSession().update()`, which
trips the `trigger === "update"` branch in the `jwt` callback
(`src/lib/auth.ts`) and repaints the sidebar immediately instead of waiting out
`REFRESH_INTERVAL_MS`. The avatar upload does the same on success.

The card is a client component; the page is a Server Component that reads the
row and passes it down, per `context/coding-standard.md`.

### Security card

| Row | Behaviour |
|---|---|
| Password | `passwordHash` present: "Last changed {date}", or "Never changed" where `passwordChangedAt` is null, and the existing `ChangePasswordForm` in a `Sheet` at `max-w-panel-sm`. `passwordHash` null: the static "Password managed by Google" line the admin table already uses, with the same explanatory `title`. |
| Sessions | "Sign out on all devices", a `Dialog` confirm, then `signOutEverywhere()` |

`signOutEverywhere()` bumps `sessionVersion` and does **not** re-mint the
current session — unlike `changePassword`, which re-mints deliberately. It ends
this session too, so the button label and the confirm dialog say so plainly
("This signs you out here as well") and the action redirects to `/signin`.

### `/account/password` — the loop this avoids

`/account/password` **cannot** simply redirect to `/settings`. The portal layout
redirects a `mustChangePassword` user *to* `/account/password`, so a blanket
redirect ping-pongs forever. Instead:

- `mustChangePassword === true` → the standalone `AuthCard` page it is today,
  unchanged. This is the forced flow and it must not need the portal shell.
- `mustChangePassword === false` → `redirect("/settings#password")`

`src/proxy.ts`'s `PASSWORD_CHANGE_PATH` and the reset-password emails
(`/reset-password/[token]`, a different route) are untouched.

### Entry points

`UserMenu`'s dropdown gains **Settings** above the existing **Sign out**, with
a separator. `MobileTopBar` uses the same `UserMenu`, so both get it from one
change.

## 6. Actions and validation

`src/actions/profile.ts`, every one `requireUser()` + Zod +
`{ success, data } | { success, error }`:

- `updateProfile({ name })`
- `setGeneratedAvatar({ style, seed })` — style must be one of the five
- `removeAvatar()`
- `signOutEverywhere()`

`src/lib/validation/profile.ts` holds `displayNameSchema` and the avatar file
rules, so the route handler and the actions validate against one source.

## 7. Tests

Unit (Vitest):

- `initials`: one word, three words, empty string, leading/trailing spaces,
  a non-Latin name, a name that is only spaces
- `avatarObjectKey` / `avatarUrl` round-trip, and that the URL carries `?v=`
- `displayNameSchema`: trims, rejects empty and 81 characters, accepts 80
- avatar file rules: rejects a PDF, a 6 MB PNG, a 9000px image; accepts a 2 MB JPEG
- `signOutEverywhere` increments `sessionVersion` by exactly one
- `updateProfile` rejects an empty name without writing
- each of the five style definitions loads and renders: `new Avatar(style,
  { seed: "Aisha Rahman", size: 256 }).toString()` returns SVG markup
- rendering is **deterministic**: the same style and seed produce byte-identical
  SVG across two calls
- no rendered SVG among the five contains `@keyframes`
- `gaze` never renders a `pill`, `column`, `egg` or `arch` shape across 200 seeds
- an unknown option key throws rather than being silently ignored, so a future
  DiceBear upgrade that renames an option fails the suite instead of quietly
  dropping the pin
- `setGeneratedAvatar` rejects a style id outside the five

Browser, against the live database, all test data removed afterwards:

1. Upload a real picture; it appears in the profile card, the sidebar **without
   a reload**, the Activity card and the PO table
2. Pick each of the five styles in turn; the six variants render, Shuffle
   changes them, and the chosen one survives a reload and appears everywhere an
   uploaded photo would
3. Remove it; initials come back
4. Change the password from `/settings`; the session survives, `passwordChangedAt`
   updates, and the card reads the new date
5. "Sign out on all devices" lands on `/signin` and the old cookie is dead
6. A `mustChangePassword` user still lands on the standalone `/account/password`
   and is not redirected into a loop
7. `/settings` at 390, 768 and 1440px: no horizontal overflow, no clipped text,
   no sub-44px control on phone

`npm run build` and `npm run lint` pass before any commit.

## 8. Acceptance criteria

1. A user can set, replace and remove their own picture, and the change is
   visible in the sidebar without reloading the page.
2. An uploaded picture is stored in R2 as a 256×256 WebP and served from a
   stable URL that changes when the picture changes.
3. The R2 bucket stays private; no avatar is reachable signed-out.
4. A Google user's photo is never overwritten by an upload, and an upload
   survives them signing in with Google again.
5. A user can choose a generated avatar from the five styles without leaving
   the page, and no request reaches `api.dicebear.com` at any point — in the
   picker, on save, or on any later render.
6. The croodles attribution is visible wherever the styles are offered.
7. Generated avatars are static: no rendered avatar contains an animation.
8. Every place the portal names a person shows that person beside the name,
   with initials where there is no picture and a neutral glyph for "System".
9. `initials` is defined once for people, and `signin/pending`'s unrelated
   email monogram is left as it is.
10. A user can change their display name and their password from `/settings`,
   and can sign out on all devices.
11. Email, role and member-since are visible and clearly not editable.
12. The forced-password-change flow is unchanged and cannot loop.
13. No raw hex, px font size or arbitrary Tailwind value is added; every new
    surface uses `@theme` tokens.

## 9. Out of scope

- Restoring a Google profile photo after an upload has replaced it — see §2.
- Changing your own email address. It is the identity key, the Google link and
  how an admin finds a user, so it needs a verify-new-address round trip
  through Resend — which has never successfully sent (deferred backlog item 4).
- Notification, theme and locale preferences. No such subsystem exists; each
  would be a new column plus a fallback path in every page that reads it.
- The other 56 DiceBear styles. Five is a picker; sixty is a catalogue, and
  every extra style is another licence to track.
- Per-style options beyond the pinned `shape` and `animation` — hair, colour,
  background and the rest. The seed plus Shuffle already gives enough variety.
- Cropping or rotating before upload. `fit: "cover"` centre-crops; a real
  cropper is the same deferred work as the Phase 08 product image editor.
- Avatars in the "Uploaded by" filter — see §4.

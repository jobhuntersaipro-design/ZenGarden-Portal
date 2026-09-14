# Phase 30 — Shop cart speed

**Goal:** Adding to the cart and stepping a line's cartons on
`shop.lovinghandsportal.com` answers in well under a second, where today it
takes several. Nothing the buyer sees changes except how long they wait.

**Architecture:** No new screen, no new column. Four causes, each found by
reading the wire, the query log and the code rather than guessed at — and
the biggest one was not the one the investigation started with:

1. **A fixed 8-second deadlock on every stepper tap and every remove.**
   `ClientCart` awaited `useAwaitableRefresh()` from inside the stepper's
   own pending transition. React entangles a transition started while an
   async action is pending with that action, so the refresh could not settle
   until the action did — and the action was waiting on the refresh. Every
   tap sat on the hook's 8 s give-up. Measured locally: the wire was done in
   0.6 s (action 338 ms, refresh 226 ms) and the buttons unlocked at
   **8198 ms**. Production runs the same client code.
2. **Every mutation rendered the route twice.** `revalidateShop()` inside the
   action already re-renders the current route into the action's own
   response ("In Server Functions, revalidatePath updates the UI immediately
   if viewing the affected path" — Next.js 16.2 docs); `router.refresh()`
   after it rendered the same tree again. The cart's refresh and
   `AddToCart`'s are both gone. The revalidation now names the storefront
   **layout**, not the cart and home pages, so a product page — where
   `AddToCart` sits — is covered too and its "In cart (n)" label moves
   without a second request.
3. **The function ran an ocean away from the database.** Production
   responses carry `x-vercel-id: sin1::iad1::…` — the request enters at
   Singapore's edge and runs in Washington DC — while Neon is
   `ap-southeast-1`. `vercel.json` gains `"regions": ["sin1"]`.
4. **The viewer was read twice per render.** The storefront layout and every
   page under it each call `loadShopViewer()`, and each call is an `auth()`
   (which re-reads the user row whenever the token is older than five
   minutes, and a Server Component render cannot write the refreshed token
   back) plus a second user read. `loadShopViewer` is wrapped in React's
   `cache()`.

`setCartons` and `removeFromCart` also return the re-priced cart, and
`ClientCart` renders it at once — belt and braces beside the action's own
rendered response, and what lets the stepper unlock the moment the action
answers.

**Branch:** `fix/shop-cart-speed`, from `main`.

## 1. Measured, one stepper tap, local dev server against the Singapore development branch

| | Before | After |
| --- | --- | --- |
| Requests per tap | 2 (`POST /cart`, `GET /cart?_rsc`) | 1 (`POST /cart`) |
| Prisma queries per tap | 28 | 17 |
| Server time | 338 ms + 226 ms | 257 ms (action 121 ms) |
| Stepper unlocked after | **8198 ms** | **280 ms** |

Add to cart on a product page: "In cart (4)" → "In cart (5)" in 257 ms, one
`POST`, no second request. Remove line: empty state in 202 ms, the header
badge gone, one `POST`. Zero console errors.

Production adds the region: before this phase each of those queries crossed
`iad1` → Singapore at roughly 230 ms; after deploy they run beside the
database.

## 2. Tests

- `src/actions/cart.test.ts`: `setCartons` and `removeFromCart` return the
  re-priced cart from `loadCart`, scoped to the caller.
- Existing `shop-viewer.test.ts` passes unchanged under `cache()`.
- Production after deploy: `x-vercel-id` reads `sin1::sin1::…`.

## 3. Not in scope

Product variants (Phase 31) and the order review step (Phase 32) are their
own phases. `useAwaitableRefresh` itself is unchanged: `/settings` uses it
from a transition that does not await it back, and `SendOrderCta` still
awaits it once after a send — that path was not re-timed here.

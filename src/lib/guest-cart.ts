import { MAX_CARTONS_PER_LINE, MAX_GUEST_LINES } from "@/lib/validation/cart";

/**
 * A guest's cart, held in `localStorage` rather than a `WebOrder` row —
 * there is no session to attach one to. Product ids and cartons only, the
 * same rule the client's cart keeps: a price is never stored here, so it can
 * never go stale. Pure — no `window` — so it is testable without a DOM and
 * safe to import from a server module without dragging one in.
 */
export type GuestCartLine = { productId: string; cartons: number };
export type GuestCart = { v: 1; lines: GuestCartLine[]; updatedAt: string };

export const GUEST_CART_KEY = "lh-shop-cart";

export { MAX_GUEST_LINES };

export const EMPTY_GUEST_CART: GuestCart = { v: 1, lines: [], updatedAt: "" };

/**
 * Sanitises whatever was under `lines` in stored or incoming JSON: a
 * non-string or empty `productId` is dropped, a `cartons` that is not a
 * positive integer is dropped, an oversized one is clamped, a duplicate id
 * keeps its last occurrence, and the result is capped at `MAX_GUEST_LINES`.
 */
function sanitizeLines(raw: unknown): GuestCartLine[] {
  if (!Array.isArray(raw)) return [];

  const byId = new Map<string, number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { productId, cartons } = entry as Record<string, unknown>;
    if (typeof productId !== "string" || productId.length === 0) continue;
    if (typeof cartons !== "number" || !Number.isInteger(cartons) || cartons <= 0) {
      continue;
    }
    byId.set(productId, Math.min(cartons, MAX_CARTONS_PER_LINE));
  }

  return [...byId.entries()]
    .slice(0, MAX_GUEST_LINES)
    .map(([productId, cartons]) => ({ productId, cartons }));
}

/**
 * Tolerant on purpose: bad JSON, an unrecognised `v`, or lines that do not
 * parse all come back as an empty cart rather than throwing — a guest's
 * browsing must never break because their stored cart is stale or was hand
 * edited.
 */
export function parseGuestCart(raw: string | null): GuestCart {
  if (raw === null) return EMPTY_GUEST_CART;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_GUEST_CART;
  }

  if (!data || typeof data !== "object" || (data as Record<string, unknown>).v !== 1) {
    return EMPTY_GUEST_CART;
  }

  return { v: 1, lines: sanitizeLines((data as Record<string, unknown>).lines), updatedAt: "" };
}

const withLines = (lines: GuestCartLine[]): GuestCart => ({
  v: 1,
  lines,
  updatedAt: new Date().toISOString(),
});

/** Cartons past MAX_CARTONS_PER_LINE clamp rather than error — this is a cart, not a form. */
const clampCartons = (cartons: number) => Math.min(cartons, MAX_CARTONS_PER_LINE);

/** Adds to an existing line's cartons, or starts a new one. */
export function addLine(cart: GuestCart, productId: string, cartons: number): GuestCart {
  const existing = cart.lines.find((line) => line.productId === productId);
  const lines = existing
    ? cart.lines.map((line) =>
        line.productId === productId
          ? { ...line, cartons: clampCartons(line.cartons + cartons) }
          : line,
      )
    : [...cart.lines, { productId, cartons: clampCartons(cartons) }];
  return withLines(lines);
}

/** Replaces a line's cartons. `cartons <= 0` removes the line instead. */
export function setLine(cart: GuestCart, productId: string, cartons: number): GuestCart {
  if (cartons <= 0) return removeLine(cart, productId);
  const clamped = clampCartons(cartons);
  const exists = cart.lines.some((line) => line.productId === productId);
  const lines = exists
    ? cart.lines.map((line) => (line.productId === productId ? { ...line, cartons: clamped } : line))
    : [...cart.lines, { productId, cartons: clamped }];
  return withLines(lines);
}

export function removeLine(cart: GuestCart, productId: string): GuestCart {
  return withLines(cart.lines.filter((line) => line.productId !== productId));
}

export const guestCartonCount = (cart: GuestCart): number =>
  cart.lines.reduce((sum, line) => sum + line.cartons, 0);

export const guestCountOf = (cart: GuestCart, productId: string): number =>
  cart.lines.find((line) => line.productId === productId)?.cartons ?? 0;

/**
 * "Something just went into the cart" (2026-09-25). The badge counts lines,
 * so adding more cartons of a product already in the cart leaves its number
 * unchanged — and a badge that only moves when its number does would say
 * nothing about the add. `AddToCart` announces; `CartBadge` listens.
 */
const EVENT = "zg:cart-added";

export function announceCartAdded() {
  window.dispatchEvent(new Event(EVENT));
}

export function onCartAdded(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

import { Check } from "lucide-react";

/**
 * Where the buyer is, from cart to confirmed (Phase 33).
 *
 * Four steps, named as the customer asked for them: **Cart → Review →
 * Confirm → We'll be in touch**. It is a progress indicator, not navigation —
 * nothing here is clickable, because moving between checkout steps is done by
 * the screen's own buttons and a link back to a step you have left would
 * invite a half-finished order.
 *
 * Rendered as an ordered list so it is one thing to a screen reader, with the
 * current step carrying `aria-current="step"` and the finished ones saying so
 * in text that is visible only to them.
 */

export const CHECKOUT_STEPS = ["Cart", "Review", "Confirm", "We'll be in touch"] as const;

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

/** 1-based, matching how the steps read. */
export type CheckoutStep = 1 | 2 | 3 | 4;

export function CheckoutSteps({
  current,
  /** How far the order has actually got, once it has left the buyer's hands. */
  state = "pending",
}: {
  current: CheckoutStep;
  state?: CheckoutState;
}) {
  return (
    <nav aria-label="Order progress">
      <ol className="flex flex-wrap items-center gap-xs">
        {CHECKOUT_STEPS.map((step, index) => {
          const position = index + 1;
          const done = state !== "pending";
          const isDone = done || position < current;
          const isCurrent = !done && position === current;
          const override =
            position === CHECKOUT_STEPS.length ? LAST_STEP_LABEL[state] : null;
          const label = override ?? step;

          return (
            <li key={step} className="flex items-center gap-xs">
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={`flex h-8 items-center gap-xxs rounded-pill px-sm text-[length:var(--text-caption)] ${
                  isCurrent
                    ? "bg-ink font-semibold text-canvas"
                    : isDone
                      ? "border border-hairline-strong text-ink"
                      : "border border-hairline text-ink-tertiary"
                }`}
              >
                {isDone ? (
                  <Check className="size-3.5 shrink-0" aria-hidden />
                ) : (
                  <span
                    aria-hidden
                    className={`flex size-4 shrink-0 items-center justify-center rounded-full text-[length:var(--text-caption)] tabular-nums ${
                      isCurrent ? "bg-canvas text-ink" : "bg-surface text-ink-tertiary"
                    }`}
                  >
                    {position}
                  </span>
                )}
                <span>{label}</span>
                {isDone ? <span className="sr-only">, done</span> : null}
              </span>

              {position < CHECKOUT_STEPS.length ? (
                <span
                  aria-hidden
                  className={`h-px w-4 ${isDone ? "bg-hairline-strong" : "bg-hairline"}`}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

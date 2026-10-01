"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { piecesFor } from "@/lib/cartons";
import nf from "@/components/arc/number-field/number-field.module.css";

/**
 * Cartons in, pieces shown. There is no conversion: `listPrice` is per carton
 * and `packSize` only tells the reader what is inside one.
 *
 * `useOptimistic` so the number moves on click rather than after the round
 * trip; the server value replaces it when the action settles.
 *
 * **A typed number is never held back until blur** (S-01, 2026-09-29). It used
 * to be committed only when the box lost focus, so typing 4 and clicking Add
 * to cart at once added the count from before: the blur's commit ran as a
 * transition and the click read the old state. A `live` caller holds the
 * count in its own state, so it gets every keystroke at once — including 0 for
 * an empty box, which is the caller's to refuse. The cart's caller is a
 * server write, so it gets the number once typing pauses, on Enter, or on
 * blur, whichever comes first.
 */
const TYPE_SETTLE_MS = 400;

export function CartonStepper({
  value,
  packSize,
  unit,
  min = 1,
  onChange,
  label,
  size = "md",
  disabled = false,
  live = false,
}: {
  value: number;
  packSize: number | null;
  unit: string;
  min?: number;
  onChange: (cartons: number) => Promise<{ success: boolean; error?: string }>;
  label: string;
  /** `lg` is the product page's buy box (§5.4): 52px buttons and value fused
   * into one `rounded-pill` frame, matching the canvas exactly. `md` (the
   * default) keeps every existing caller — the cart table's own row —
   * unchanged, including the "N pieces" line under it. `card` is `md` across
   * the width of a catalogue card, whose inner width is about 165px at 390px
   * with two cards to a row: the 44px buttons are kept, because the touch
   * floor is not negotiable, and the value between them takes whatever is
   * left rather than a fixed 64px that would not fit beside them. It carries
   * no pieces caption — a line under every card in a grid, to say what the
   * card's own pack line already says. */
  size?: "md" | "lg" | "card";
  /** A cart row whose product has left the shop (§5.5): both buttons and the
   * input go truly `disabled`, so a keyboard `Enter` on a focused button
   * cannot commit a change — a wrapping `pointer-events-none` only blocks a
   * pointer, never keyboard activation. */
  disabled?: boolean;
  /** `onChange` only sets the caller's own state (the product page, a card,
   * the variant rows): every keystroke is passed straight through, an empty
   * box as 0, so the caller's Add to cart always reads what is on screen. */
  live?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [typed, setTyped] = useState<string | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = live ? value : optimistic;

  const cancelSettle = () => {
    if (settleTimer.current === null) return;
    clearTimeout(settleTimer.current);
    settleTimer.current = null;
  };
  useEffect(() => cancelSettle, []);

  const commit = (next: number) => {
    if (next < min || !Number.isInteger(next)) return;
    if (live) {
      void onChange(next);
      return;
    }
    startTransition(async () => {
      setOptimistic(next);
      const result = await onChange(next);
      if (!result.success) toast.error(result.error ?? "That didn't work.");
    });
  };

  const step = (next: number) => {
    cancelSettle();
    setTyped(null);
    commit(next);
  };

  const type = (raw: string) => {
    const text = raw.replace(/[^0-9]/g, "");
    setTyped(text);
    if (live) {
      void onChange(text === "" ? 0 : Number(text));
      return;
    }
    cancelSettle();
    if (text === "") return;
    const next = Number(text);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      commit(next);
    }, TYPE_SETTLE_MS);
  };

  // Blur and Enter: whatever is typed is final. A live caller left with
  // nothing valid goes back to the smallest count rather than an empty box.
  const settle = () => {
    cancelSettle();
    if (typed !== null) {
      const next = typed === "" ? Number.NaN : Number(typed);
      if (live) {
        if (!(next >= min)) void onChange(min);
      } else if (next !== optimistic) {
        commit(next);
      }
    }
    setTyped(null);
  };

  const inputProps = {
    "aria-label": `${unit}s — ${label}`,
    inputMode: "numeric" as const,
    disabled,
    value: typed ?? String(current),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => type(event.target.value),
    onBlur: settle,
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        settle();
      }
    },
  };

  const pieces = piecesFor(current, packSize);

  // Arc's number field — a hairline shell with the two steps set
  // inside it — around the same input and the same commit rules. The steps
  // keep the 44px floor below `sm`.
  const fewerDisabled = disabled || pending || current <= min;
  const moreDisabled = disabled || pending;
  return (
    <div className="flex flex-col gap-xxs">
      <div className={nf.field} data-size={size === "lg" ? "lg" : "md"}>
        <div
          className={`${nf.control} ${size === "md" ? "" : "w-full max-w-none"}`}
          data-disabled={disabled || undefined}
        >
          <button
            type="button"
            className={`${nf.step} max-sm:size-11 max-sm:flex-none`}
            aria-label={`One fewer ${unit} — ${label}`}
            disabled={fewerDisabled}
            onClick={() => step(current - 1)}
          >
            <span className={nf.icon}>
              <Minus className="size-4" strokeWidth={1.75} aria-hidden />
            </span>
          </button>
          <div className={nf.valueWrap}>
            <input
              {...inputProps}
              className={`${nf.value} h-full w-full min-w-0 border-0 bg-transparent text-center outline-none disabled:cursor-not-allowed`}
            />
          </div>
          <button
            type="button"
            className={`${nf.step} max-sm:size-11 max-sm:flex-none`}
            aria-label={`One more ${unit} — ${label}`}
            disabled={moreDisabled}
            onClick={() => step(current + 1)}
          >
            <span className={nf.icon}>
              <Plus className="size-4" strokeWidth={1.75} aria-hidden />
            </span>
          </button>
        </div>
      </div>
      {size === "md" ? (
        <p className="text-[length:var(--text-caption)] text-ink-tertiary">
          {pieces === null
            ? `${current} ${unit}${current === 1 ? "" : "s"}`
            : `${pieces} piece${pieces === 1 ? "" : "s"}`}
        </p>
      ) : null}
    </div>
  );
}

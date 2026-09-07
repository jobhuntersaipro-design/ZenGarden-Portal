/**
 * The one loading element for a control that is waiting.
 *
 * A ring in `currentColor`, so it reads as canvas on the dark pill and as ink
 * on a chip, and never as the brand gradient — the gradient is the CTA
 * family, not a status. Sonner already spins the same ring in its loading
 * toast, so a chip, a button and a toast all wait the same way.
 *
 * `aria-hidden`: the control that renders it says what it is doing in words
 * (its pending label, or `aria-busy` on the group). The ring is the picture,
 * not the announcement.
 */
const SIZES = {
  /** Beside a label, inside a control. */
  sm: "size-3.5 border-2",
  /** Alone on a surface, where the control it describes is the picture. */
  md: "size-7 border-2",
} as const;

export function Spinner({
  size = "sm",
  className = "",
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 animate-spinner rounded-full border-current border-r-transparent ${SIZES[size]} ${className}`}
    />
  );
}

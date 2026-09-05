/**
 * "Loving" in the brand gradient, "Hands" in ink. line-height must clear the
 * descender on the g: background-clip: text paints only the line box, so a
 * tight leading crops it.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div
      className={`font-display text-[length:var(--text-heading-md)] leading-[1.25] font-bold tracking-[-0.91px] ${className}`}
    >
      <span className="bg-brand-gradient bg-clip-text text-transparent">Loving</span>
      <span className="text-ink">&nbsp;Hands</span>
    </div>
  );
}

import { cartonLines, type CartonSize } from "@/lib/carton";

/** The carton's size, weight and CBM as caption lines; nothing when unset. */
export function CartonLines({ size, className = "" }: { size: CartonSize; className?: string }) {
  const lines = cartonLines(size);
  if (lines.length === 0) return null;
  return (
    <ul className={`text-[length:var(--text-caption)] text-ink-tertiary ${className}`}>
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

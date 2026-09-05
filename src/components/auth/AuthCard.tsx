import type { ReactNode } from "react";
import { Wordmark } from "@/components/portal/Wordmark";

/**
 * The card every auth screen sits in (design reference §3.1): 480px,
 * `rounded-xxl`, canvas on the `surface` page, hairline border, `p-xxl`,
 * indigo-tinted `shadow-md`.
 */
export function AuthCard({
  title,
  subtitle,
  eyebrow,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <div className="w-full max-w-auth-card rounded-xxl border border-hairline bg-canvas p-xxl shadow-md">
      <Wordmark />
      {eyebrow ? (
        <p className="mt-lg font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          {eyebrow}
        </p>
      ) : null}
      <h1
        className={`${eyebrow ? "mt-xxs" : "mt-lg"} font-display text-[length:var(--text-display-lg)] font-[650] tracking-[-1.6px] text-ink`}
      >
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-xs text-[length:var(--text-body-md)] text-ink-secondary">
          {subtitle}
        </p>
      ) : null}
      {children}
    </div>
  );
}

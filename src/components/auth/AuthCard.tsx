import type { ReactNode } from "react";
import { Wordmark } from "@/components/portal/Wordmark";

/**
 * The card every auth screen sits in (design reference §3.1): 480px,
 * `rounded-xxl`, canvas on the `surface` page, hairline border, `p-xxl`,
 * indigo-tinted `shadow-md`.
 *
 * It arrives rather than appearing: the card fades and rises as one object
 * (`animate-auth-card`), and its parts slide into place behind it in reading
 * order — wordmark, heading, subtitle, then whatever form the screen carries
 * — one `stagger-N` step (30ms) apart, everything settled by about 460ms.
 *
 * The contents slide but never fade, and `globals.css` has the measurement
 * that earned that: fading them on `rise` instead left a visible white card
 * with nothing in it, because the card's height is final from the first frame
 * and its own fade finishes long before a delayed child begins. All of it is
 * `animation: none` under `prefers-reduced-motion`.
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
    <div className="w-full max-w-auth-card animate-auth-card rounded-xxl border border-hairline bg-canvas p-xxl shadow-md">
      <Wordmark className="animate-auth-settle stagger-1" />
      {eyebrow ? (
        <p className="animate-auth-settle stagger-2 mt-lg font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          {eyebrow}
        </p>
      ) : null}
      <h1
        className={`${eyebrow ? "mt-xxs" : "mt-lg"} animate-auth-settle stagger-2 font-display text-[length:var(--text-display-lg)] font-[650] tracking-[-1.6px] text-ink`}
      >
        {title}
      </h1>
      {subtitle ? (
        <p className="animate-auth-settle stagger-3 mt-xs text-[length:var(--text-body-md)] text-ink-secondary">
          {subtitle}
        </p>
      ) : null}
      {/* One step for the whole form: the fields are a single thing to fill
          in, and staggering each label and input would animate the control
          somebody is already reaching for. */}
      <div className="animate-auth-settle stagger-4">{children}</div>
    </div>
  );
}

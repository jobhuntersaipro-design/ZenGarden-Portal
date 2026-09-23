"use client";

import Link from "next/link";
import { useShopViewer } from "@/components/shop/ShopViewer";
import { shopHref } from "@/lib/shop-routes";

/**
 * The shop's opening band: a signature, not a billboard.
 *
 * It was a full-bleed gradient card carrying an eyebrow, a two-line display
 * heading, a four-line paragraph and a button — on a 390px phone that is the
 * whole first screen, with no product, no price and nothing to buy on it, and
 * its own bottle silhouettes were `lg:flex`, so the one brand image in it was
 * hidden exactly where most of the traffic is. The copy is cut to the two
 * lines that say what this is, and the space goes to the products below,
 * which now sit directly under this band.
 *
 * The gradient goes with it. It still carries the brand in the wordmark above
 * (`bg-brand-gradient bg-clip-text`), where it is a mark rather than a
 * ground; the design system's rule is that it is for gradient CTAs and the
 * wordmark, never a section background.
 *
 * `useShopViewer()` decides whether "Already a customer? Sign in" shows — a
 * signed-in client has nothing to sign in to, so it is hidden rather than
 * disabled.
 */
export function Hero() {
  const viewer = useShopViewer();

  return (
    <div className="max-w-[54ch]">
      <p className="font-mono text-[length:var(--text-eyebrow)] uppercase text-ink-tertiary">
        Zen Garden wholesale
      </p>
      <h1 className="mt-xs font-display text-[length:var(--text-display-md)] leading-[1.2] font-[650] tracking-[-1.36px] text-ink lg:text-[length:var(--text-display-xl)] lg:tracking-[-1.68px]">
        Personal care,
        <br />
        by the carton.
      </h1>
      <p className="mt-xs text-[length:var(--text-body-md)] text-ink-secondary">
        ZEN GARDEN · MR. KING · L.HANDS
      </p>
      <div className="mt-lg flex flex-wrap items-center gap-md">
        <Link
          href={shopHref.catalogue()}
          className="flex h-control-lg items-center pressable rounded-pill bg-ink px-lg text-[length:var(--text-button-md)] font-semibold text-canvas hover:bg-ink-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Shop all products
        </Link>
        {viewer.kind !== "client" ? (
          <Link
            href={shopHref.signIn()}
            className="flex h-control-lg items-center rounded-sm text-[length:var(--text-button-md)] font-semibold text-ink underline decoration-hairline-strong underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Already a customer? Sign in
          </Link>
        ) : null}
      </div>
    </div>
  );
}

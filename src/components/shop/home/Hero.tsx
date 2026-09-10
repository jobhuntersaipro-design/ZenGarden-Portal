"use client";

import Link from "next/link";
import { useShopViewer } from "@/components/shop/ShopViewer";
import { shopHref } from "@/lib/shop-routes";

/**
 * The brand-gradient hero. Two columns from `lg` — copy and CTAs, then three
 * decorative bottle wells; below `lg` it is one column and the wells drop
 * rather than squeeze.
 *
 * `useShopViewer()` decides whether "Already a customer? Sign in" shows — a
 * signed-in client has nothing to sign in to, so it is hidden rather than
 * disabled.
 */
export function Hero() {
  const viewer = useShopViewer();

  return (
    <div className="overflow-hidden rounded-xxl bg-brand-gradient lg:grid lg:grid-cols-2 lg:items-center">
      <div className="p-lg lg:p-xxl">
        <p className="font-mono text-[length:var(--text-eyebrow)] uppercase text-canvas/80">
          Loving Hands wholesale
        </p>
        <h1 className="mt-sm font-display text-[length:var(--text-display-md)] leading-[1.2] font-[650] tracking-[-1.36px] text-canvas lg:mt-md lg:text-[length:var(--text-display-2xl)] lg:leading-[1.1] lg:tracking-[-2.1px]">
          Personal care,
          <br />
          by the carton.
        </h1>
        <p className="mt-sm text-[length:var(--text-body-lg)] font-medium text-canvas/90 lg:mt-md">
          ZEN GARDEN, MR. KING and L.HANDS — browse the full range, build your
          order, and sign in only when you send it.
        </p>
        <div className="mt-lg flex flex-wrap items-center gap-sm">
          <Link
            href={shopHref.catalogue()}
            className="flex h-control-lg items-center rounded-pill bg-canvas px-lg text-[length:var(--text-button-md)] font-semibold text-ink hover:bg-canvas/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Shop all products
          </Link>
          {viewer.kind !== "client" ? (
            <Link
              href={shopHref.signIn()}
              className="flex h-control-lg items-center rounded-pill border border-canvas/55 px-lg text-[length:var(--text-button-md)] font-semibold text-canvas hover:bg-canvas/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Already a customer? Sign in
            </Link>
          ) : null}
        </div>
      </div>

      {/* Decorative only — the real product photography lives on each
          product card. Hidden below `lg`, where the hero is one column.
          The three paths are the canvas's own bottle silhouettes
          (Main.dc.html:81-92), not a stand-in icon: same viewBox, same
          strokes, the middle bottle drawn larger. */}
      <div className="hidden items-end justify-end gap-md p-xxl pl-0 lg:flex" aria-hidden>
        <div className="flex h-48 w-36 items-center justify-center rounded-xl border border-canvas/30 bg-canvas/16">
          <svg
            viewBox="0 0 60 112"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            className="h-28 w-14 text-canvas/85"
          >
            <path d="M24 4h12v12l10 9v79a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V25l10-9z" />
            <path d="M14 46h32" />
          </svg>
        </div>
        <div className="flex h-64 w-44 items-center justify-center rounded-xl border border-canvas/38 bg-canvas/24">
          <svg
            viewBox="0 0 60 112"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            className="h-32 w-16 text-canvas/95"
          >
            <path d="M22 4h16v10l8 8v86a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V22l8-8z" />
            <rect x="14" y="44" width="32" height="26" rx="4" />
          </svg>
        </div>
        <div className="flex h-48 w-36 items-center justify-center rounded-xl border border-canvas/30 bg-canvas/16">
          <svg
            viewBox="0 0 60 112"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            className="h-28 w-14 text-canvas/85"
          >
            <path d="M20 4h20v8l6 12v84a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V24l6-12z" />
            <path d="M14 52h32" />
          </svg>
        </div>
      </div>
    </div>
  );
}

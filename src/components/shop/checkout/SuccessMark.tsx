"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DotLottieReact,
  setWasmUrl,
  type DotLottie,
} from "@lottiefiles/dotlottie-react";
import { Check } from "lucide-react";

/**
 * Served from `public/animations/success.lottie`. The proxy's matcher skips
 * `.lottie`, or the shop host would rewrite this path under /shop and 404.
 */
const SUCCESS_ANIMATION = "/animations/success.lottie";

/** Past this, a player still loading is treated as one that never will. */
const LOAD_TIMEOUT_MS = 4000;

// The player's WebAssembly, bundled with the app. Left to its default it is
// fetched from jsdelivr, and a blocked or slow CDN left the mark an empty box
// with no error to fall back on. Resolved the way DocumentPreview resolves the
// pdf.js worker, so the bundler fingerprints it.
if (typeof window !== "undefined") {
  setWasmUrl(
    new URL(
      "@lottiefiles/dotlottie-web/dotlottie-player.wasm",
      import.meta.url,
    ).toString(),
  );
}

/**
 * The mark on "Your order is with us": the success animation, played once.
 *
 * Under reduced motion it is not hidden but held on its last frame, so every
 * buyer sees the same finished mark. The plain checkmark is the fallback for
 * an animation that errors or has not loaded within four seconds, so the page
 * never shows an empty space where the confirmation should be.
 */
export function SuccessMark() {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    if (state !== "loading") return;
    const timer = setTimeout(() => setState("failed"), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [state]);

  // Stable, so the player is not handed a new callback — and more listeners —
  // on every render.
  const onPlayer = useCallback((player: DotLottie | null) => {
    if (!player) return;
    player.addEventListener("load", () => {
      setState("ready");
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        player.setFrame(player.totalFrames - 1);
      } else {
        player.play();
      }
    });
    player.addEventListener("loadError", () => setState("failed"));
  }, []);

  if (state === "failed") {
    return (
      <span
        aria-hidden
        className="mx-auto flex size-16 items-center justify-center rounded-full bg-surface-soft"
      >
        <Check className="size-7 text-accent-green" />
      </span>
    );
  }

  return (
    <div aria-hidden className="mx-auto size-28">
      <DotLottieReact
        src={SUCCESS_ANIMATION}
        className="size-full"
        dotLottieRefCallback={onPlayer}
      />
    </div>
  );
}

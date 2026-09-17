"use client";

import { useCallback, useState } from "react";
import type { DotLottie } from "@lottiefiles/dotlottie-react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { Check } from "lucide-react";

/**
 * Served from `public/animations/success.lottie`. The proxy's matcher skips
 * `.lottie`, or the shop host would rewrite this path under /shop and 404.
 */
const SUCCESS_ANIMATION = "/animations/success.lottie";

/**
 * The mark on "Your order is with us": the success animation, played once.
 *
 * The checkmark it replaced is still the fallback, for two readers — someone
 * who has asked for reduced motion, and anyone whose animation fails to load
 * (the file missing, or the player's WebAssembly blocked). Either way the page
 * still says the order went through.
 */
export function SuccessMark() {
  const [failed, setFailed] = useState(false);
  // Stable, so the player is not handed a new callback — and a second
  // listener — on every render.
  const onPlayer = useCallback((player: DotLottie | null) => {
    player?.addEventListener("loadError", () => setFailed(true));
  }, []);

  const check = (
    <span
      aria-hidden
      className="mx-auto flex size-16 items-center justify-center rounded-full bg-surface-soft"
    >
      <Check className="size-7 text-accent-green" />
    </span>
  );

  if (failed) return check;

  return (
    <>
      <div aria-hidden className="mx-auto size-28 motion-reduce:hidden">
        <DotLottieReact
          src={SUCCESS_ANIMATION}
          autoplay
          className="size-full"
          dotLottieRefCallback={onPlayer}
        />
      </div>
      <div className="motion-safe:hidden">{check}</div>
    </>
  );
}

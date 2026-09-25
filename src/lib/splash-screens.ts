/**
 * The iPhone launch images a home-screen open shows before the first byte
 * arrives (2026-09-25). iOS picks one only when its media query matches the
 * device's CSS size and pixel ratio exactly, and falls back to white when none
 * does — so each supported screen needs its own file.
 *
 * `scripts/make-splash-images.ts` draws the files from this list and the root
 * layout's metadata links them, so the two cannot drift. Portrait only: the
 * portal is used upright on a phone, and a landscape launch just shows white.
 */
export const SPLASH_SCREENS = [
  { width: 440, height: 956, ratio: 3 }, // iPhone 16 Pro Max
  { width: 402, height: 874, ratio: 3 }, // iPhone 16 Pro
  { width: 430, height: 932, ratio: 3 }, // 14/15 Pro Max, 15/16 Plus
  { width: 393, height: 852, ratio: 3 }, // 14/15 Pro, 15, 16
  { width: 428, height: 926, ratio: 3 }, // 12/13 Pro Max, 14 Plus
  { width: 390, height: 844, ratio: 3 }, // 12, 13, 14
  { width: 375, height: 812, ratio: 3 }, // X, XS, 11 Pro
  { width: 360, height: 780, ratio: 3 }, // 12/13 mini
  { width: 414, height: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { width: 414, height: 896, ratio: 2 }, // XR, 11
  { width: 375, height: 667, ratio: 2 }, // SE, 8
] as const;

export type SplashScreen = (typeof SPLASH_SCREENS)[number];

export const splashPath = (s: SplashScreen) =>
  `/splash/launch-${s.width * s.ratio}x${s.height * s.ratio}.png`;

export const splashMedia = (s: SplashScreen) =>
  `(device-width: ${s.width}px) and (device-height: ${s.height}px) and (-webkit-device-pixel-ratio: ${s.ratio}) and (orientation: portrait)`;

/**
 * Where the badge sits, in CSS pixels, so the launch image hands over to
 * `AppSplash` without the logo jumping: the splash centres a 160px badge,
 * a 24px gap, a 4px bar, a 24px gap and a 20px line.
 */
export const SPLASH_BADGE = { height: 160, stack: 232 } as const;

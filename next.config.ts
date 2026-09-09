import type { NextConfig } from "next";

/**
 * The two entry points that reach `sharp` — the avatar upload route, and the
 * `/settings` page whose client components call `setGeneratedAvatar` and
 * `removeAvatar`.
 */
const SHARP_ROUTES = [
  "/api/avatars",
  "/settings",
  // Phase 14. A glob, not the literal route path: these keys are matched as
  // globs, so "[id]" would be read as a character class matching one "i" or
  // "d" and never match the real page. Written literally it deployed green
  // and then 500ed in production with the same ERR_DLOPEN_FAILED as 2026-09-08.
  //
  // This cannot be caught locally in either form. A macOS build traces sharp
  // anyway, because the platform only strips @img/sharp-libvips* when
  // `hasNextSupport` is true — so the emitted .nft.json looks correct on a
  // laptop whether or not the include matched. The only proof is a request to
  // the deployed route.
  "/api/products/**",
];

/**
 * `sharp` is a native module: a `.node` binary that dlopens libvips, which
 * ships beside it as `@img/sharp-libvips-<platform>`. **Next's build trace
 * drops that libvips package on purpose when the build runs on Vercel** — see
 * `collect-build-traces.ts`, which adds `**\/@img/sharp-libvips*\/**\/*` to
 * `serverIgnores` whenever `hasNextSupport` is true, because the platform used
 * to provide sharp itself for image optimization.
 *
 * The result on 2026-09-08 was a production-only failure with a very
 * particular shape: `@img/sharp-linux-x64` *was* in the bundle, so `sharp`
 * loaded its own JS and then died in the loader —
 * `ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.6: cannot open shared object file`.
 * Every path that imports `src/lib/avatar-store.ts` returned Next's 500 page
 * before its own try/catch could run, so choosing an avatar and uploading a
 * photo both failed while the rest of the app was fine. It cannot reproduce
 * locally: a macOS build traces the darwin packages, which are not ignored.
 *
 * An include re-adds what the ignore removed. `@img/**` rather than the
 * libvips package by name so the platform tuple is not written down twice.
 */
const nextConfig: NextConfig = {
  reactCompiler: true,
  devIndicators: false,
  outputFileTracingIncludes: Object.fromEntries(
    SHARP_ROUTES.map((route) => [
      route,
      ["./node_modules/sharp/**/*", "./node_modules/@img/**/*"],
    ]),
  ),
};

export default nextConfig;

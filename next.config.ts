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
  // 2026-09-24: a buyer's logo is fitted with sharp.
  "/api/buyers/**",
];

/**
 * The entry points whose Server Actions send a purchase-order email, and so
 * rasterise page 1 of its PDF (2026-09-18): the shop's cart and checkout
 * (`submitWebOrder`), a shop order's review (`confirmWebOrder`,
 * `declineWebOrder`) and a purchase order's edit sheet (`updatePurchaseOrder`).
 * Globs, for the reason `SHARP_ROUTES` gives.
 */
const PO_PREVIEW_ROUTES = ["/shop/**", "/web-orders/**", "/purchase-orders/**"];

/**
 * What the preview needs at runtime and a build trace cannot see:
 * `@napi-rs/canvas` is required by pdf.js through `createRequire` and loads a
 * platform binary by name, and the standard fonts are read from disk by path
 * — the purchase order does not embed its Helvetica. Missing any of them, the
 * email still goes, as HTML and the PDF, with no picture.
 */
const PO_PREVIEW_FILES = [
  "./node_modules/pdfjs-dist/legacy/build/**/*",
  "./node_modules/pdfjs-dist/standard_fonts/**/*",
  "./node_modules/@napi-rs/**/*",
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
  /**
   * `@react-pdf/renderer` ships a WebAssembly layout engine (yoga) and
   * fontkit, neither of which survives being bundled into a route chunk.
   * Left to Turbopack it resolves `node:module` and the chunking fails
   * outright — the same class of failure the Prisma runtime caused when it
   * reached a client component in Phase 33. Kept external, it loads from
   * node_modules at runtime as a plain CommonJS dependency.
   *
   * `src/lib/pdf/purchase-order.tsx` is `import "server-only"` for the other
   * half of the rule: nothing may pull it toward the browser in the first
   * place.
   *
   * pdf.js and its Node canvas, which draw an email's preview of that PDF
   * (`src/lib/po-email.ts`), are kept external for the same reason: a native
   * binary and a worker module loaded by path. The browser's react-pdf viewer
   * is unaffected — this list is for server bundles only.
   */
  serverExternalPackages: ["@react-pdf/renderer", "pdfjs-dist", "@napi-rs/canvas"],
  // Phase 26 renamed the admin room's second section. `:path*` matches zero
  // segments too, so the bare /admin/customers is covered by the one rule.
  async redirects() {
    return [
      {
        source: "/admin/customers/:path*",
        destination: "/admin/buyers/:path*",
        permanent: true,
      },
    ];
  },
  outputFileTracingIncludes: {
    ...Object.fromEntries(
      SHARP_ROUTES.map((route) => [
        route,
        ["./node_modules/sharp/**/*", "./node_modules/@img/**/*"],
      ]),
    ),
    ...Object.fromEntries(PO_PREVIEW_ROUTES.map((route) => [route, PO_PREVIEW_FILES])),
  },
};

export default nextConfig;

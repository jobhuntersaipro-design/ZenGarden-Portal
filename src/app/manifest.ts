import type { MetadataRoute } from "next";

/**
 * What a phone uses when someone adds the portal or the shop to their home
 * screen. `background_color` is the colour Android paints before the first
 * byte, and matches `AppSplash`'s canvas so the hand-over does not flash.
 * Named "Zen Garden" rather than "… Portal" because the shop host serves the
 * same file, and `start_url` is relative, so each host opens on its own home.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zen Garden",
    short_name: "Zen Garden",
    description: "Purchase orders, fulfilment and the Zen Garden shop",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon.png", sizes: "192x192", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}

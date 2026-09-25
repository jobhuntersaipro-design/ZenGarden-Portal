import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans, Sometype_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { SPLASH_SCREENS, splashMedia, splashPath } from "@/lib/splash-screens";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sometypeMono = Sometype_Mono({
  variable: "--font-sometype-mono",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zen Garden Portal",
  description:
    "Purchase-order intake and fulfillment tracking for the Zen Garden ops team",
  // Opened from a home-screen icon, iOS shows a launch image until the first
  // byte arrives and plain white when none matches the device. These are the
  // badge on white, placed where `AppSplash` draws it, so the launch image,
  // the streamed splash and the page follow each other without a blank frame.
  appleWebApp: {
    capable: true,
    title: "Zen Garden",
    statusBarStyle: "default",
    startupImage: SPLASH_SCREENS.map((screen) => ({
      url: splashPath(screen),
      media: splashMedia(screen),
    })),
  },
};

/**
 * `viewportFit: "cover"` is what makes `env(safe-area-inset-*)` resolve to
 * anything but zero, and the mobile top bar and tab bar both read it. No
 * `maximumScale` or `userScalable` — pinch-zoom is an accessibility feature and
 * this is a form-heavy product.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased",
        plusJakartaSans.variable,
        inter.variable,
        sometypeMono.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Real-user performance metrics, reported to Vercel. It sits in the
            root layout so one instance covers the portal, the admin room and
            the storefront, and it is inert outside a Vercel deployment — a
            local `npm run dev` collects nothing. */}
        <SpeedInsights />
      </body>
    </html>
  );
}

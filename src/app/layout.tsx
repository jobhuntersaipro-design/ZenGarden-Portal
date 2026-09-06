import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans, Sometype_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

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
  title: "Loving Hands Portal",
  description:
    "Purchase-order intake and fulfillment tracking for the Loving Hands ops team",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

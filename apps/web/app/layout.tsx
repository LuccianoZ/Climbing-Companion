import type { Metadata, Viewport } from "next";
// Self-hosted rather than next/font/google: the font is resolved from
// node_modules at build time, so `next build` needs no network access to
// fonts.googleapis.com. That matters here because the API, the database and
// the web app are all expected to build and run on a developer machine that
// may be offline (and, in CI, behind a proxy that does not allowlist
// Google Fonts). It also drops a third-party request from every page load.
import "@fontsource-variable/space-grotesk";
import "./globals.css";

export const metadata: Metadata = {
  title: "Climbing Companion",
  description: "Find your route, send it.",
};

// Foundation §17's DoD: climber-facing surfaces are mobile-first. The map
// fills the viewport between a fixed header and tab bar, so the page itself
// must never rubber-band or zoom under a pinch meant for the map.
export const viewport: Viewport = {
  themeColor: "#f5f1e8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
// Self-hosted rather than next/font/google: the font is resolved from
// node_modules at build time, so `next build` needs no network access to
// fonts.googleapis.com. That matters here because the API, the database and
// the web app are all expected to build and run on a developer machine that
// may be offline (and, in CI, behind a proxy that does not allowlist
// Google Fonts). It also drops a third-party request from every page load.
import "@fontsource-variable/space-grotesk";
import "./globals.css";
import { SessionProvider } from "@/lib/session";

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

// `children: ReactNode` rather than Next's generated `LayoutProps<"/">`:
// that type is emitted into .next/types, so a clean checkout cannot run
// `tsc --noEmit` until a build or dev server has been started once. This
// layout has no parallel-route slots, so the generated type adds nothing
// over the explicit one, and typecheck stops depending on build order.
export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">
        {/* AR-22: one GET /api/auth/me per page load, from the browser, its
            answer shared by every screen. Mounted here rather than per-page
            so navigating between tabs does not re-ask the same question --
            and so the header menu can render the right thing before any
            individual page has decided what it needs. */}
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}

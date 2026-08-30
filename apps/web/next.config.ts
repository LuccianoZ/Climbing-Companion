import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The browser calls /api/* on its own origin and Next proxies it to the
  // NestJS app -- no CORS preflight, and no NEXT_PUBLIC_API_URL to keep in
  // sync per environment. This runs on the dev server, so `localhost:4000`
  // resolves on the machine running `next dev`, not on the phone loading the
  // page -- which is what makes LAN testing work at all.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://localhost:4000/api/:path*' },
    ];
  },

  // Next's dev server refuses cross-origin requests for /_next/static/* by
  // default. Opening the app from a phone on the LAN (http://<host-ip>:3000)
  // is exactly that, so the chunk request for the dynamically imported
  // Leaflet map is blocked and BL-019's `loading` fallback sits at
  // "Loading map..." forever -- the failure is silent in the page itself and
  // only shows up in the dev server's terminal.
  //
  // Dev-only, and mobile-first is a Definition-of-Done item (Foundation §17),
  // so testing on a real handset needs to keep working. Add whatever address
  // `next dev` prints as its Network URL; DHCP can reassign it, so expect to
  // update this occasionally.
  allowedDevOrigins: ['192.168.1.237'],
};

export default nextConfig;

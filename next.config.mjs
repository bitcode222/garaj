import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the same `out/` folder is the website and the iOS app bundle.
  output: "export",
  // `/invoices/` -> `invoices/index.html`, which the iOS router can resolve.
  trailingSlash: true,
  images: { unoptimized: true },
  reactCompiler: true,
  poweredByHeader: false,
  devIndicators: { position: "bottom-right" },
};

// The dev server reaches the local storefront (`npm run cf:dev`) so its bookings show up on :3000. Rewrites need a server,
// so only this phase drops the static export.
const devConfig = {
  ...nextConfig,
  output: undefined,
  rewrites: async () => [{ source: "/api/shop/:path*/", destination: "http://localhost:8787/api/shop/:path*" }],
};

export default (phase) => (phase === PHASE_DEVELOPMENT_SERVER ? devConfig : nextConfig);

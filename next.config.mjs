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

export default nextConfig;

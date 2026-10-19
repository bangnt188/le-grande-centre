import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://legrandecentre.vn/",
);
const basePath = siteUrl.pathname.replace(/\/+$/, "");

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@mall/ui"],
  serverExternalPackages: ["@cf-wasm/photon"],
  output: "standalone",
  distDir: process.env.NODE_ENV === "development" ? process.env.NEXT_DIST_DIR || ".next" : ".next",
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  // Bound public-route and adjacent-unit prefetch freshness instead of retaining status for five minutes.
  experimental: { staleTimes: { dynamic: 0, static: 60 } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/api/auth/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

if (process.env.NODE_ENV === "development") initOpenNextCloudflareForDev();
export default nextConfig;

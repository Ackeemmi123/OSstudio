import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // End-to-end tests build the app twice (Supabase and local demo) side by side.
  distDir: process.env.STUDIO_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Baseline protections for every page and API route. Studio OS is never
  // embedded in another site and uses no camera, microphone or location.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  // Sections folded into Today and the client workspace in the simplified layout.
  redirects() {
    return [
      { source: "/projects", destination: "/", permanent: false },
      { source: "/tasks", destination: "/", permanent: false },
      { source: "/approvals", destination: "/", permanent: false },
      { source: "/agents", destination: "/settings", permanent: false },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

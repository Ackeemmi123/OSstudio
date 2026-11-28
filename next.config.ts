import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // End-to-end tests build the app twice (Supabase and local demo) side by side.
  distDir: process.env.STUDIO_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // The company design's fonts are copied into every site it builds. sharp makes each site's pictures
  // (src/server/site-builds/images.ts): Next.js never bundles it (it is on its own list of server
  // packages loaded from node_modules), and its native binary and libvips (node_modules/@img, chosen
  // per platform when it is installed) are named here, so the two routes that build never depend on
  // the tracer following its optional packages.
  outputFileTracingIncludes: {
    "/api/site-builds": ["./design-systems/services/fonts/**", "./node_modules/sharp/**", "./node_modules/@img/**"],
    "/api/site-publish": ["./design-systems/services/fonts/**", "./node_modules/sharp/**", "./node_modules/@img/**"],
  },
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
      // A client's draft (/s/<token>) may be shown inside Studio OS itself, in the client's portal,
      // never in another site.
      {
        source: "/s/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
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

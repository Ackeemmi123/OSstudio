import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // End-to-end tests build the app twice (Supabase and local demo) side by side.
  distDir: process.env.STUDIO_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
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

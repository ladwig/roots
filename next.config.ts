import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Image uploads (2 MB limit in the bucket) go through Server Actions; default is 1 MB.
  // staleTimes.dynamic: pages visited in the last 30 s show at once when clicking back to them (actions that change
  // data redirect / refresh, so they still show fresh results).
  experimental: { serverActions: { bodySizeLimit: "3mb" }, staleTimes: { dynamic: 30 } },
  async redirects() {
    return [
      { source: "/settings", destination: "/settings/general", permanent: false },
      { source: "/settings/members", destination: "/settings/team", permanent: true },
      { source: "/admin", destination: "/admin/orgs", permanent: false },
      { source: "/settings/activity", destination: "/settings/general", permanent: false },
      { source: "/settings/notifications", destination: "/settings/integrations#notifications", permanent: false },
    ];
  },
  partialPrefetching: true,
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

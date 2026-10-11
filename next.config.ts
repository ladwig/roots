import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Image uploads (2 MB limit in the bucket) go through Server Actions; default is 1 MB.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  async redirects() {
    return [
      { source: "/settings", destination: "/settings/general", permanent: false },
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

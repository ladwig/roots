import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
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

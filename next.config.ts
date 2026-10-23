import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      { source: '/admin', destination: '/admin/index.html' },
      { source: '/admin/', destination: '/admin/index.html' },
      { source: '/admin/:path*', destination: '/admin/:path*' },
      { source: '/pt', destination: '/pt/index.html' },
      { source: '/pt/', destination: '/pt/index.html' },
      { source: '/pt/:path*', destination: '/pt/:path*' },
      { source: '/kiosk', destination: '/kiosk/index.html' },
      { source: '/kiosk/', destination: '/kiosk/index.html' },
      { source: '/kiosk/:path*', destination: '/kiosk/:path*' },
    ];
  },
};

export default nextConfig;

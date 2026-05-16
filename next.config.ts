import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // fal.ai CDN — uses versioned subdomains (v3, v3b, v3c, …)
      {
        protocol: "https",
        hostname: "*.fal.media",
      },
      {
        protocol: "https",
        hostname: "fal.media",
      },
      {
        protocol: "https",
        hostname: "fal-cdn-public.s3.amazonaws.com",
      },
    ],
  },
};

export default nextConfig;

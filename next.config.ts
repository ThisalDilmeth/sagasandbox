import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase Storage — generated images from handle-fal-webhook
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // fal.ai CDN — raw output URLs (v3, v3b, and other regional subdomains)
      {
        protocol: "https",
        hostname: "**.fal.media",
        pathname: "/files/**",
      },
      {
        protocol: "https",
        hostname: "fal-cdn-public.s3.amazonaws.com",
      },
    ],
  },
};

export default nextConfig;

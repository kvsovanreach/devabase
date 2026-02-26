import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // Disable image optimization in Docker (can be re-enabled with a custom loader)
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

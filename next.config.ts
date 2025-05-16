import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config) => {
    // Required for WebSocket support in Next.js app router
    config.externals = [
      ...(config.externals || []),
      { bufferutil: "bufferutil", "utf-8-validate": "utf-8-validate" },
    ];
    return config;
  },
  // Ensure the server can handle WebSocket connections
  serverExternalPackages: ["bufferutil", "utf-8-validate"],
  eslint: {
    // Don't run ESLint during build - we'll run it separately
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;

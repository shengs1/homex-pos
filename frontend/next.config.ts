import type { NextConfig } from "next";

const backendApiUrl = process.env.BACKEND_API_URL || "http://localhost:5000/api";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["disparate-sizable-brick.ngrok-free.dev"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendApiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
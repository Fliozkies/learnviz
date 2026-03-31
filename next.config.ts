import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  basePath: '/learnviz',
  assetPrefix: '/learnviz',
};


export default nextConfig;

import type { NextConfig } from "next";

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'files.speakerdeck.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'speakerdeck.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.dev.to',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'qiita-user-contents.imgix.net',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'zenn.dev',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'b.hatena.ne.jp',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.b.hatena.ne.jp',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },
};

export default withBundleAnalyzer(nextConfig);

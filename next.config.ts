import type { NextConfig } from "next";

import bundleAnalyzer from '@next/bundle-analyzer';
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // ビルド最適化設定
  compress: true,
  productionBrowserSourceMaps: false,
  // E2E/CIビルドのみESLintエラーで停止しない（通常ビルドでは有効）
  eslint: {
    ignoreDuringBuilds: process.env.NEXT_IGNORE_ESLINT === 'true' || process.env.E2E === 'true',
  },
  
  // 実験的機能で最適化
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['@radix-ui', 'lucide-react', 'recharts'],
  },
  
  // セキュリティヘッダー設定
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://api.github.com https://www.googleapis.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'"
            ].join('; ')
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ]
      }
    ]
  },
  
  // 画像最適化
  // Custom loader for unoptimized images (2025-10-06)
  // - Supports 800+ domains without whitelist management
  // - Avoids SSRF risks (browser fetches directly)
  // - See: lib/image-loader.js
  images: {
    loader: 'custom',
    loaderFile: './lib/image-loader.js',
  },
};

export default withBundleAnalyzer(nextConfig);

import type { NextConfig } from "next";

import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // ビルド最適化設定
  compress: true,
  productionBrowserSourceMaps: false,

  // 実験的機能で最適化
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['@radix-ui', 'lucide-react', 'recharts'],
  },

  // セキュリティヘッダはproxy.tsで管理
  // Phase 3: Complete migration to proxy.ts
  // See: proxy.ts, config/security-headers.ts

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

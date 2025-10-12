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

  // セキュリティヘッダはmiddleware.tsで管理
  // Phase 3: Complete migration to middleware.ts
  // See: middleware.ts, config/security-headers.ts

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

import type { NextConfig } from "next";
import path from "node:path";

import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // ビルド最適化設定
  compress: true,
  productionBrowserSourceMaps: false,

  // Server external packages
  // jsdom and parse5 must be unbundled due to ESM/CJS compatibility
  // @dqbd/tiktoken must be unbundled due to WASM dependency (tiktoken_bg.wasm)
  serverExternalPackages: ['jsdom', 'parse5', '@mozilla/readability', '@dqbd/tiktoken', '@prisma/adapter-pg', 'pg'],

  // 実験的機能で最適化
  experimental: {
    optimizeCss: process.env.NODE_ENV !== 'development',
    optimizePackageImports: ['@radix-ui', 'lucide-react', 'recharts', 'd3-scale', 'd3-hierarchy', 'd3-interpolate', 'd3-force'],
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

  // Webpack configuration
  webpack(config, { dev, isServer }) {
    // Prisma v7 generated client uses importFileExtension="ts".
    // Webpack needs extensionAlias to resolve .ts imports in .js context.
    config.resolve = {
      ...config.resolve,
      extensionAlias: {
        ...config.resolve?.extensionAlias,
        '.ts': ['.ts', '.tsx', '.js'],
      },
    };

    // Prisma v7: server-only modules in client bundles.
    // 1. Generated client.ts → browser.ts (types only, no PrismaClient/node:fs)
    // 2. Node.js built-ins fallback (pg depends on net/tls/dns)
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        [path.resolve(__dirname, 'prisma/generated/prisma/client.ts')]:
          path.resolve(__dirname, 'prisma/generated/prisma/browser.ts'),
      };
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        dns: false,
        fs: false,
      };
    }

    // Externalize @dqbd/tiktoken in development mode (for WASM support)
    // serverExternalPackages only works in production build
    if (dev && isServer) {
      config.externals ??= [];
      if (!config.externals.includes('@dqbd/tiktoken')) {
        config.externals.push('@dqbd/tiktoken');
      }
    }
    return config;
  },
};

export default withBundleAnalyzer(nextConfig);

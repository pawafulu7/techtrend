import type { NextConfig } from 'next';
import path from 'node:path';

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
  serverExternalPackages: [
    'jsdom',
    'parse5',
    '@mozilla/readability',
    '@dqbd/tiktoken',
    '@prisma/adapter-pg',
    'pg',
  ],

  // 実験的機能で最適化
  experimental: {
    optimizeCss: process.env.NODE_ENV !== 'development',
    optimizePackageImports: [
      '@radix-ui',
      'lucide-react',
      'recharts',
      'd3-scale',
      'd3-hierarchy',
      'd3-interpolate',
      'd3-force',
    ],
  },

  // セキュリティヘッダはproxy.tsで管理
  // Phase 3: Complete migration to proxy.ts
  // See: proxy.ts, config/security-headers.ts

  // 画像最適化（Issue #718）
  // サムネイルは 2,000 を超えるホストから集めるので allowlist は作れない。https の全ホストを許可し、
  // 取得と変換は Vercel の画像最適化が行う（開発と Docker では Next 自身が sharp で行う）。
  // /_next/image は任意の https URL を受けるので、proxy.ts で Basic 認証ゲートの中に置き（匿名では 401）、
  // w と q を絞って変換枠の浪費を抑える。
  // 失敗（Hobby の枠超過の 402 など）は OptimizedImage が元の URL に切り替える
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
    // 取得する元画像の上限（既定は 50MB）。サムネイルの元画像は直近 30 日の 57 件で最大 1.55MB、
    // 既知の最大（7339×5504）でも 2.95MB。超えた画像は最適化に失敗し、元の URL で出す
    maximumResponseBody: 5_000_000,
    formats: ['image/avif', 'image/webp'],
    // 記事カード（20vw〜100vw）・/reader の一覧（320〜380px）・記事詳細（最大 672px）で使う幅だけ。
    // sizes に vw があると deviceSizes[0] × 最小の割合より小さい候補は srcset から外れるので、
    // 384 は imageSizes ではなく deviceSizes に置く
    deviceSizes: [384, 640, 828, 1080, 1200, 1920],
    imageSizes: [256],
    qualities: [75],
    // サムネイルはほぼ変わらないので、変換結果を 31 日保つ（変換の回数を抑える）
    minimumCacheTTL: 2678400,
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

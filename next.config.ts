import type { NextConfig } from "next";

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig: NextConfig = {
  // ビルド最適化設定
  compress: true,
  productionBrowserSourceMaps: false,
  // デプロイ成果物を最小化（standalone 出力）
  output: 'standalone',
  
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
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200],  // 不要な大きいサイズを削除
    imageSizes: [16, 32, 48, 64, 96, 128],     // 不要な大きいサイズを削除
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
        hostname: 'static.zenn.studio',
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
      {
        protocol: 'https',
        hostname: 'bcdn.docswell.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'video.docswell.com',
        pathname: '/**',
      },
    ],
  },
};

export default withBundleAnalyzer(nextConfig);

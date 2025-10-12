import type { NextConfig } from "next";

import bundleAnalyzer from '@next/bundle-analyzer';
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/**
 * Development CSP - HMR対応のため緩和
 */
export function getDevelopmentCSP(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https: ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
}

/**
 * Production CSP - unsafe-eval削除、セキュリティ強化
 */
export function getProductionCSP(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.github.com https://www.googleapis.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests"
  ].join('; ');
}

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
  
  // セキュリティヘッダー設定 (Phase 1: Enhanced CSP/Permissions-Policy)
  async headers() {
    const isDevelopment = process.env.NODE_ENV === 'development';

    return [
      {
        source: '/:path*',
        headers: [
          // Content Security Policy (環境別)
          {
            key: 'Content-Security-Policy',
            value: isDevelopment ? getDevelopmentCSP() : getProductionCSP()
          },
          // HSTS (本番環境のみ、HTTPS必須)
          ...(isDevelopment ? [] : [{
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains'
          }]),
          // X-Frame-Options
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          // X-Content-Type-Options
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          // Referrer-Policy
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          // Permissions-Policy (拡張)
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
          },
          // Cross-Origin-Opener-Policy
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups'
          },
          // Cross-Origin-Embedder-Policy
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'unsafe-none'
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

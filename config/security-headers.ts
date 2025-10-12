import { NextResponse, NextRequest } from 'next/server';

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

/**
 * セキュリティヘッダをレスポンスに設定
 * Phase 2: next.config.tsと並行運用
 * Phase 3: middleware.tsでの唯一の設定箇所
 */
export function setSecurityHeaders(response: NextResponse, request: NextRequest): void {
  const isDevelopment = process.env.NODE_ENV === 'development';

  // CSP
  const csp = isDevelopment ? getDevelopmentCSP() : getProductionCSP();
  response.headers.set('Content-Security-Policy', csp);

  // HSTS（HTTPS時のみ、本番環境のみ）
  if (request.nextUrl.protocol === 'https:' && !isDevelopment) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  // 基本ヘッダ
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions-Policy（拡張版）
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
  );

  // Cross-Origin-Opener-Policy
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  // Cross-Origin-Embedder-Policy
  response.headers.set('Cross-Origin-Embedder-Policy', 'unsafe-none');
}

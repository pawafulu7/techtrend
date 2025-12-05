import { NextRequest, NextResponse } from 'next/server';
import { getThemeFromCookie } from '@/lib/theme-cookie';
import { setSecurityHeaders } from '@/config/security-headers';
import {
  csrfProtection,
  isCSRFExemptPath,
  requiresCSRFProtection,
} from '@/lib/middleware/csrf-protection';

// Optional Basic Auth (enabled when env is set)
function needsBasicAuth(): boolean {
  const enabled = process.env.BASIC_AUTH_ENABLED === 'true';
  const hasCreds = !!(process.env.BASIC_AUTH_PASS || process.env.BASIC_PASSWORD);
  return enabled && hasCreds;
}

function checkBasicAuth(request: NextRequest): boolean {
  // Allow Vercel Cron without auth
  if (request.headers.get('x-vercel-cron') === '1') return true;

  const user = process.env.BASIC_AUTH_USER || 'user';
  const pass = process.env.BASIC_AUTH_PASS || process.env.BASIC_PASSWORD || '';

  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Basic ')) return false;

  try {
    const base64 = header.split(' ')[1] || '';
    const decoded = atob(base64);
    const [u, p] = decoded.split(':');
    return u === user && p === pass;
  } catch {
    return false;
  }
}

// 認証が必要なパスのリスト
const protectedPaths = [
  '/profile',
  '/favorites',
  '/history',
];

// 認証が必要なAPIパス
const protectedApiPaths = [
  '/api/favorites',
  // '/api/article-views', // 未認証ユーザーも記録できるようにするため除外
];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // CSRF Protection for API routes
  if (pathname.startsWith('/api/')) {
    if (requiresCSRFProtection(request.method) && !isCSRFExemptPath(pathname)) {
      const csrfResponse = await csrfProtection(request);
      if (csrfResponse) {
        return csrfResponse;
      }
    }
  }

  // Site-wide Basic Auth
  if (needsBasicAuth()) {
    const ok = checkBasicAuth(request);
    if (!ok) {
      return new NextResponse('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Protected"' },
      });
    }
  }
  
  // 保護されたパスかチェック
  const isProtectedPath = protectedPaths.some(path => 
    pathname.startsWith(path)
  );
  
  const isProtectedApiPath = protectedApiPaths.some(path => 
    pathname.startsWith(path)
  );

  if (isProtectedPath || isProtectedApiPath) {
    // セッションチェック（cookieベース）
    const sessionCookie = request.cookies.get('authjs.session-token') || 
                         request.cookies.get('__Secure-authjs.session-token');

    if (!sessionCookie) {
      // APIルートの場合は401を返す
      if (isProtectedApiPath) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }

      // ページの場合はログインページにリダイレクト
      const url = new URL('/auth/login', request.url);
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }
  }

  const response = NextResponse.next();

  // セキュリティヘッダ設定（Phase 2: 並行運用検証）
  setSecurityHeaders(response, request);

  // テーマCookieの処理
  const theme = getThemeFromCookie(request);

  // レスポンスヘッダーにテーマ情報を追加（デバッグ用）
  response.headers.set('x-theme', theme);

  return response;
}

export const config = {
  matcher: [
    // Match all routes except static files, fonts, and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)',
  ],
};

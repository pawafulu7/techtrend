import { NextRequest, NextResponse } from 'next/server';
import { compareSecrets } from '@/lib/utils/compare-secrets';
import { getThemeFromCookie } from '@/lib/cookies/theme-cookie';
import { setSecurityHeaders } from '@/config/security-headers';
import {
  csrfProtection,
  isCSRFExemptPath,
  requiresCSRFProtection,
} from '@/lib/middleware/csrf-protection';
import { AUTH_COOKIES } from '@/lib/config/auth-cookies';

// Optional Basic Auth (enabled when env is set)
function needsBasicAuth(): boolean {
  const enabled = process.env.BASIC_AUTH_ENABLED === 'true';
  const hasCreds = !!(process.env.BASIC_AUTH_PASS || process.env.BASIC_PASSWORD);
  return enabled && hasCreds;
}

function checkBasicAuth(request: NextRequest): boolean {
  // Allow cron requests with valid CRON_SECRET Bearer token
  const cronSecret = process.env.CRON_TOKEN || process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring('Bearer '.length) : undefined;
    if (token && compareSecrets(token, cronSecret)) return true;
  }

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

// メンテナンスモードの除外パス判定
// メンテ中でも通常応答するパス: API・管理者ログイン・メンテ画面自身・静的アセット。
// （静的アセットは matcher で概ね除外されるが、念のためここでも弾く）
function isMaintenanceExempt(pathname: string): boolean {
  return (
    pathname.startsWith('/api/') ||
    pathname === '/auth/login' ||
    pathname === '/maintenance' ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  );
}

// 認証が必要なパスのリスト
const protectedPaths = [
  '/profile',
  '/favorites',
  '/history',
  '/digest',
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

  // Maintenance Mode: 管理者以外をメンテナンス画面（HTTP 503）に切り替える。
  // OFF（未設定 or 'true' 以外）のときは getSession を呼ばず既存フローを維持する。
  // proxy は Node.js ランタイム固定のため、ここで動的 import する auth/getUserAuthData
  // （Prisma/Redis/pino 依存）は問題なく動作する。
  if (
    process.env.MAINTENANCE_MODE?.trim() === 'true' &&
    !isMaintenanceExempt(pathname)
  ) {
    const respondMaintenance = async () => {
      const { createMaintenanceResponse } = await import(
        '@/lib/maintenance/maintenance-response'
      );
      const maintenanceRes = createMaintenanceResponse();
      setSecurityHeaders(maintenanceRes, request);
      return maintenanceRes;
    };

    try {
      const [{ auth }, { getUserAuthData }] = await Promise.all([
        import('@/lib/auth/auth'),
        import('@/lib/auth/user-auth-cache'),
      ]);

      const session = await auth.api.getSession({ headers: request.headers });

      let isAdmin = false;
      if (session?.user?.id) {
        // session.user.role はログイン時スナップショットで降格が反映されないため、
        // 既存 admin-check と同様 DB（Redis キャッシュ付き）の role を参照する。
        const authData = await getUserAuthData(session.user.id);
        isAdmin =
          !!authData && !authData.deletedAt && authData.role === 'admin';
      }

      if (!isAdmin) {
        return await respondMaintenance();
      }
    } catch {
      // フェイルセーフ: session/DB 取得失敗時は 500 ではなくメンテ画面（503）に倒す。
      // （getUserAuthData は Redis 失敗は握るが DB query 例外は握らないため、ここで捕捉する）
      return await respondMaintenance();
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
    const sessionCookie = request.cookies.get(AUTH_COOKIES.sessionToken);

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

import { NextRequest, NextResponse } from 'next/server';
import {
  BASIC_AUTH_CHALLENGE,
  buildGateSetCookie,
  evaluateGate,
  type GateEnv,
} from '@/lib/auth/basic-auth-gate';
import { getThemeFromCookie } from '@/lib/cookies/theme-cookie';
import { setSecurityHeaders } from '@/config/security-headers';
import {
  csrfProtection,
  isCSRFExemptPath,
  requiresCSRFProtection,
} from '@/lib/middleware/csrf-protection';
import { AUTH_COOKIES } from '@/lib/config/auth-cookies';

// Basic 認証ゲートの設定値。lib/ 配下は process.env の直接参照を ESLint で禁止しており、
// env.ts はモジュールロード時に一度だけ parse するため、ここ（proxy.ts）で都度読んで渡す。

/**
 * 空白のみの値を未設定として扱う。lib/config/env.ts の sanitizeEnv() と同じ規則。
 *
 * API 側は sanitize 済みの env.CRON_TOKEN || env.CRON_SECRET でシークレットを選ぶ。
 * ここで生の process.env を使うと、例えば CRON_TOKEN='   ' / CRON_SECRET='valid' の
 * 構成でゲートだけが空白文字列を選び、API が受理するリクエストをゲートが 401 にする。
 * シークレットの選択規則を API 側と一致させるための正規化。
 */
function readOptionalEnv(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() === '' ? undefined : value;
}

function readGateEnv(): GateEnv {
  return {
    enabled: process.env.BASIC_AUTH_ENABLED,
    user: process.env.BASIC_AUTH_USER,
    pass: process.env.BASIC_AUTH_PASS,
    legacyPass: process.env.BASIC_PASSWORD,
    gateSecret: process.env.BASIC_AUTH_GATE_SECRET,
    cronSecret:
      readOptionalEnv(process.env.CRON_TOKEN) ??
      readOptionalEnv(process.env.CRON_SECRET),
    isProduction: process.env.NODE_ENV === 'production',
  };
}

// 設定不備は全リクエストが 503 になる重大事象なので必ず気づけるようにする。
// ただしリクエスト毎に出すとログが溢れるため、プロセスにつき一度だけ出力する。
let gateMisconfigurationLogged = false;

// メンテナンスモードの除外パス判定
// メンテ中でも通常応答するパス: API・管理者ログイン・メンテ画面自身・静的アセット。
// - /api/* は一括除外。バッチ収集・ヘルスチェック・認証 API を動かし続けるため。
//   保護 API（protectedApiPaths）はメンテ画面ではなく従来どおり 401 を返す（意図的）。
// - /auth/login のみ除外（管理者ログイン導線）。/auth/signup・/auth/verify はメンテ中
//   封鎖する仕様（新規登録・メール認証を止める）。verify のメールリンクを通したくなった
//   場合はここに /auth/verify を追加すること。
// - 静的アセットは matcher で概ね除外されるが、念のためここでも弾く。
function isMaintenanceExempt(pathname: string): boolean {
  return (
    pathname.startsWith('/api/') ||
    pathname === '/auth/login' ||
    pathname.startsWith('/auth/login/') ||
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

  // Site-wide Basic Auth（認証済み状態は署名付きゲート Cookie で保持する）
  // サイト全体のゲートなので CSRF より外側で評価する。未認証リクエストのために
  // CSRF 側のセッション照会（DB アクセス）を走らせないためでもある。
  const gateEnv = readGateEnv();
  const gate = evaluateGate(request, gateEnv);

  if (gate.kind === 'misconfigured') {
    // fail-closed: Basic 認証が有効なのに設定が不完全。
    // 認証を黙って無効化してサイトが全公開になるより、明示的に止める方が安全。
    if (!gateMisconfigurationLogged) {
      gateMisconfigurationLogged = true;
      console.error(
        `[proxy] Basic 認証が有効ですが設定が不完全なため全リクエストを 503 にしています: ${gate.reason}`
      );
    }
    const misconfiguredRes = new NextResponse('Service Unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
    setSecurityHeaders(misconfiguredRes, request);
    return misconfiguredRes;
  }

  if (gate.kind === 'fail') {
    const challengeRes = new NextResponse('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': BASIC_AUTH_CHALLENGE,
        'Cache-Control': 'no-store',
      },
    });
    setSecurityHeaders(challengeRes, request);
    return challengeRes;
  }

  // ゲート通過後の全 return をここに通す。
  // Cookie を最後の NextResponse.next() にだけ付けると、初回アクセスがメンテナンス 503 や
  // ログインリダイレクトに落ちた場合に発行されず、再入力の症状がそのまま残る。
  const finalize = <T extends NextResponse>(response: T): T => {
    // ゲートを通過した応答は共有キャッシュに載せない。
    // basic だけでなく cookie（2 回目以降）と cron も対象にする必要がある。
    // また /api/ も除外できない: app/api/stats 等が public, s-maxage と
    // CDN-Cache-Control を返しており、これは「ゲート済みコンテンツを下流 CDN が
    // 共有キャッシュしてよい」という宣言になってしまうため。
    const passedGate =
      gate.kind === 'basic' || gate.kind === 'cookie' || gate.kind === 'cron';

    if (passedGate) {
      // Cookie はドキュメント遷移でのみ発行する。API 応答（beacon 含む）には載せない。
      if (gate.kind === 'basic' && !pathname.startsWith('/api/')) {
        response.headers.append(
          'Set-Cookie',
          buildGateSetCookie(request, gateEnv)
        );
      }

      response.headers.set('Cache-Control', 'private, no-store');
      // 下流 CDN 向けの指定も明示的に打ち消す（delete だけでは後段が再設定しうる）
      response.headers.set('CDN-Cache-Control', 'no-store');

      // 既存の Vary を保持したうえで認証に影響するヘッダを追加する
      const vary = new Set(
        (response.headers.get('Vary') ?? '')
          .split(',')
          .map(value => value.trim())
          .filter(Boolean)
      );
      vary.add('Cookie');
      vary.add('Authorization');
      response.headers.set('Vary', [...vary].join(', '));
    }

    setSecurityHeaders(response, request);
    return response;
  };

  // CSRF Protection for API routes
  if (pathname.startsWith('/api/')) {
    if (requiresCSRFProtection(request.method) && !isCSRFExemptPath(pathname)) {
      const csrfResponse = await csrfProtection(request);
      if (csrfResponse) {
        return finalize(csrfResponse);
      }
    }
  }

  // Maintenance Mode: 管理者以外をメンテナンス画面（HTTP 503）に切り替える。
  // OFF（未設定 or 'true' 以外）のときは getSession を呼ばず既存フローを維持する。
  // proxy は Node.js ランタイム固定のため、ここで動的 import する auth/getUserAuthData
  // （Prisma/Redis/pino 依存）は問題なく動作する。
  if (
    // env.ts の booleanEnum と同じく trim + lowercase で判定する（'TRUE' 等も許容）
    process.env.MAINTENANCE_MODE?.trim().toLowerCase() === 'true' &&
    !isMaintenanceExempt(pathname)
  ) {
    const respondMaintenance = async () => {
      try {
        const { createMaintenanceResponse } = await import(
          '@/lib/maintenance/maintenance-response'
        );
        // セキュリティヘッダは呼び出し元の finalize が一括で適用する
        return createMaintenanceResponse();
      } catch {
        // 最終フォールバック: メンテ画面モジュールの取得すら失敗しても 503 を返す。
        return new NextResponse('Service Unavailable', {
          status: 503,
          headers: { 'Retry-After': '3600' },
        });
      }
    };

    // セッション Cookie が無ければ未認証＝非管理者確定。getSession/DB を呼ばず即 503 に倒す
    // （メンテ中の未認証アクセスで毎回 DB セッション検索が走るのを防ぐ）。
    if (!request.cookies.get(AUTH_COOKIES.sessionToken)) {
      return finalize(await respondMaintenance());
    }

    try {
      const [{ auth }, { getUserAuthData, isAdminAuthData }] =
        await Promise.all([
          import('@/lib/auth/auth'),
          import('@/lib/auth/user-auth-cache'),
        ]);

      const session = await auth.api.getSession({ headers: request.headers });

      let isAdmin = false;
      if (session?.user?.id) {
        // session.user.role はログイン時スナップショットで降格が反映されないため、
        // 既存 admin-check と同様 DB（Redis キャッシュ付き）の role を参照する。
        const authData = await getUserAuthData(session.user.id);
        isAdmin = isAdminAuthData(authData);
      }

      if (!isAdmin) {
        return finalize(await respondMaintenance());
      }
    } catch {
      // フェイルセーフ: session/DB 取得失敗時は 500 ではなくメンテ画面（503）に倒す。
      // （getUserAuthData は Redis 失敗は握るが DB query 例外は握らないため、ここで捕捉する）
      return finalize(await respondMaintenance());
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
        return finalize(
          NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        );
      }

      // ページの場合はログインページにリダイレクト
      const url = new URL('/auth/login', request.url);
      url.searchParams.set('callbackUrl', pathname);
      return finalize(NextResponse.redirect(url));
    }
  }

  const response = NextResponse.next();

  // テーマCookieの処理
  const theme = getThemeFromCookie(request);

  // レスポンスヘッダーにテーマ情報を追加（デバッグ用）
  response.headers.set('x-theme', theme);

  // セキュリティヘッダ設定とゲート Cookie 発行は finalize がまとめて行う
  return finalize(response);
}

export const config = {
  matcher: [
    // Match all routes except static files, fonts, and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)',
  ],
};

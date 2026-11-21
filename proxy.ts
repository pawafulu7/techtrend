import { NextRequest, NextResponse } from 'next/server';
import {
  resolveSiteGateConfig,
  type SiteGateRawEnv,
  type SiteGateSettings,
} from '@/lib/auth/site-gate/config';
import {
  GATED_CACHE_CONTROL,
  GATED_CDN_CACHE_CONTROL,
} from '@/lib/auth/site-gate/constants';
import {
  evaluateSiteGate,
  type SiteGateDeps,
} from '@/lib/auth/site-gate/evaluate';
import { getThemeFromCookie } from '@/lib/cookies/theme-cookie';
import { setSecurityHeaders } from '@/lib/config/security-headers';
import {
  csrfProtection,
  isCSRFExemptPath,
  requiresCSRFProtection,
} from '@/lib/middleware/csrf-protection';
import { AUTH_COOKIES } from '@/lib/config/auth-cookies';

// サイトの入口（Google ログインと許可リスト。lib/auth/site-gate/）の設定値。lib/ 配下は process.env の
// 直接参照を ESLint で禁止しており、env.ts はモジュールロード時に一度だけ parse するため、ここ（proxy.ts）で
// 都度読んで渡す。Route Handler は env.ts の値を同じ resolveSiteGateConfig に渡す。
function readSiteGateEnv(): SiteGateRawEnv {
  return {
    GATE_GOOGLE_ENABLED: process.env.GATE_GOOGLE_ENABLED,
    GATE_GOOGLE_CLIENT_ID: process.env.GATE_GOOGLE_CLIENT_ID,
    GATE_GOOGLE_CLIENT_SECRET: process.env.GATE_GOOGLE_CLIENT_SECRET,
    GATE_AUTH_SECRET: process.env.GATE_AUTH_SECRET,
    GATE_ALWAYS_ALLOWED_EMAILS: process.env.GATE_ALWAYS_ALLOWED_EMAILS,
    // 移行の守り: 以前の Basic 認証の設定が残っていて入口が有効でなければ 503 にする
    BASIC_AUTH_ENABLED: process.env.BASIC_AUTH_ENABLED,
    VERCEL_ENV: process.env.VERCEL_ENV,
    AUTH_SECRET: process.env.AUTH_SECRET,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
  };
}

// 入口用の Better Auth と許可リスト（Prisma）は、入口の Cookie があるときにだけ読む
async function loadSiteGateDeps(settings: SiteGateSettings): Promise<SiteGateDeps> {
  const { createSiteGateDeps } = await import('@/lib/auth/site-gate/gate-session');
  return createSiteGateDeps(settings);
}

// 設定不備は全リクエストが 503 になる重大事象なので必ず気づけるようにする。
// ただしリクエスト毎に出すとログが溢れるため、プロセスにつき一度だけ出力する。
let gateMisconfigurationLogged = false;
// 入口の確認の失敗（DB の障害など）も、ログが溢れないよう 1 分に 1 回までにする
const GATE_UNAVAILABLE_LOG_INTERVAL_MS = 60_000;
let gateUnavailableLoggedAt = 0;

function serviceUnavailable(request: NextRequest): NextResponse {
  const response = new NextResponse('Service Unavailable', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
  setSecurityHeaders(response, request);
  return response;
}

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
const protectedPaths = ['/profile', '/favorites', '/history', '/digest'];

// 認証が必要なAPIパス
const protectedApiPaths = [
  '/api/favorites',
  // '/api/article-views', // 未認証ユーザーも記録できるようにするため除外
];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // サイトの入口（Google ログインと許可リスト）。サイト全体の入口なので CSRF より外側で評価する。
  // 入口のログイン状態の無いリクエストのために、CSRF 側のセッション照会（DB アクセス）を走らせないためでもある。
  const gate = await evaluateSiteGate(
    request,
    resolveSiteGateConfig(readSiteGateEnv()),
    loadSiteGateDeps
  );

  if (gate.kind === 'misconfigured') {
    // fail-closed: 入口が有効なのに設定が不完全、または Basic 認証の設定が残っている。
    // 入口を黙って無効化してサイトが全公開になるより、明示的に止める方が安全。
    if (!gateMisconfigurationLogged) {
      gateMisconfigurationLogged = true;
      console.error(
        `[proxy] サイトの入口の設定が不完全なため全リクエストを 503 にしています: ${gate.reason}`
      );
    }
    return serviceUnavailable(request);
  }

  if (gate.kind === 'unavailable') {
    // 入口のログイン状態・許可リストを確かめられない（DB の障害など）。拒否の側に倒す。
    // 例外の message には接続先が入りうるので、種類だけを出す
    const now = Date.now();
    if (now - gateUnavailableLoggedAt >= GATE_UNAVAILABLE_LOG_INTERVAL_MS) {
      gateUnavailableLoggedAt = now;
      console.error(
        '[proxy] サイトの入口を確かめられないため 503 にしています:',
        gate.error instanceof Error ? gate.error.name : 'Unknown error'
      );
    }
    return serviceUnavailable(request);
  }

  if (gate.kind === 'deny') {
    // 開始・エラーページへの 302、または 401・403（どれも no-store）
    setSecurityHeaders(gate.response, request);
    return gate.response;
  }

  // 入口の通過後の全 return をここに通す（メンテナンス 503 やログインリダイレクトにも、入口の Cookie の更新と
  // キャッシュの打ち消しを付ける）。
  const finalize = <T extends NextResponse>(response: T): T => {
    // 入口を通過した応答は共有キャッシュに載せない。
    // /api/ も除外できない: 入口の内側のコンテンツを下流 CDN が共有キャッシュしてはいけないため。
    // 入口自身の経路（開始・戻り・エラー）も同じ扱いにする。
    //
    // ただし、ここで設定したヘッダは Route Handler が自分で設定したヘッダに負ける
    // （2026-10-01 に本番で実測。/api/stats の CDN-Cache-Control: max-age=600 が残り、
    // Vercel のエッジにキャッシュされていた）。そのため公開キャッシュヘッダを返す
    // route は lib/api/cache-headers.ts 経由で、入口が有効なときに自分で private, no-store
    // にする（issue #647）。ここはページ（ISR を含む）と、route が何も設定しない応答の担当。
    const passedGate = gate.kind === 'pass' || gate.kind === 'public';
    // 最適化した画像は元が公開 URL なので、共有キャッシュに載せてよい（Vercel の画像キャッシュと
    // ブラウザのキャッシュを効かせる）。入口は通すが、キャッシュの打ち消しと Cookie の発行はしない。
    // 入口の Cookie の更新はどの要求で起きるか選べず、共有キャッシュに載る画像の応答に付くと別の人に渡りうる
    const isImageOptimizer = pathname.startsWith('/_next/image');

    if (passedGate && !isImageOptimizer) {
      // 入口のログイン状態の確認が返した Set-Cookie（private, no-store の応答にだけ載せる）
      if (gate.kind === 'pass') {
        for (const cookie of gate.setCookies) {
          response.headers.append('Set-Cookie', cookie);
        }
      }

      response.headers.set('Cache-Control', GATED_CACHE_CONTROL);
      // 下流 CDN 向けの指定も明示的に打ち消す（delete だけでは後段が再設定しうる）
      response.headers.set('CDN-Cache-Control', GATED_CDN_CACHE_CONTROL);
      // Vercel のエッジ向けの最優先の指定。Route Handler はこのヘッダを付けないので
      // ここで付けた値が残る。route が lib/api/cache-headers.ts を使い忘れて
      // CDN-Cache-Control を自分で付けても、エッジには載らない（多層防御）
      response.headers.set('Vercel-CDN-Cache-Control', GATED_CDN_CACHE_CONTROL);

      // 既存の Vary を保持したうえで認証に影響するヘッダを追加する
      const vary = new Set(
        (response.headers.get('Vary') ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      );
      vary.add('Cookie');
      vary.add('Authorization');
      response.headers.set('Vary', [...vary].join(', '));
    }

    setSecurityHeaders(response, request);
    return response;
  };

  // NUL バイト（%00）を含むリクエストは 400 にする（issue #687）。
  // PostgreSQL の text は NUL を受け付けず、クエリやパスの値が DB に届くと 500 になる。
  // Next は proxy に渡す URL のクエリを URLSearchParams で組み直す（skipProxyUrlNormalize が
  // 無効のとき。有効でも生の URL がそのまま届くので同じ）。NUL は %00 として届き、
  // %2500（"%00" という文字列）は %2500 のまま届く。正当な URL に %00 は現れない。
  // ログは出さない（クエリは検索語などの利用者の入力のため）。
  if (request.url.includes('%00')) {
    const badRequest = pathname.startsWith('/api/')
      ? NextResponse.json(
          {
            success: false,
            error: { code: 'INVALID_REQUEST', message: 'Invalid request' },
          },
          { status: 400 }
        )
      : new NextResponse('Bad Request', { status: 400 });
    // 入口が無効なときは finalize が Cache-Control を付けないので、ここで付ける
    badRequest.headers.set('Cache-Control', 'no-store');
    return finalize(badRequest);
  }

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
        const { createMaintenanceResponse } =
          await import('@/lib/middleware/maintenance-response');
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
  const isProtectedPath = protectedPaths.some((path) =>
    pathname.startsWith(path)
  );

  const isProtectedApiPath = protectedApiPaths.some((path) =>
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

      // ページの場合はログインページにリダイレクト。ログインした後に同じ表示へ戻すため、検索条件も渡す
      // （/history?tab=analytics の読書分析、/digest の期間など）。callbackUrl はログイン画面で
      // sanitizeCallbackUrl（同じサイトの相対パスだけ）を通る
      const url = new URL('/auth/login', request.url);
      url.searchParams.set(
        'callbackUrl',
        `${pathname}${request.nextUrl.search}`
      );
      return finalize(NextResponse.redirect(url));
    }
  }

  const response = NextResponse.next();

  // テーマCookieの処理
  const theme = getThemeFromCookie(request);

  // レスポンスヘッダーにテーマ情報を追加（デバッグ用）
  response.headers.set('x-theme', theme);

  // セキュリティヘッダ設定と入口の Cookie の更新は finalize がまとめて行う
  return finalize(response);
}

export const config = {
  matcher: [
    // Match all routes except static files, fonts, and Next.js internals.
    // /api/ は拡張子の除外から外す。外さないと /api/articles/abc.png のような動的 route の
    // パスが proxy（ゲート・CSRF・NUL の拒否・セキュリティヘッダ）を通らない（issue #687）
    // /_next/image は除外しない。任意の https URL を受ける画像最適化を、サイトの入口の
    // 外に置くと第三者が変換枠を使い切れるため（Issue #718）
    '/((?!_next/static|favicon.ico|(?!api/).*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)',
  ],
};

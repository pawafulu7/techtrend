/**
 * 入口用の Better Auth に渡す設定と、ログイン時の利用者の確認
 *
 * 依存を持たないモジュールにする（型の import だけ）。Playwright の spec（__tests__/e2e/site-gate-auth.spec.ts）が
 * この関数で作った設定を本物の betterAuth() に渡し、開始→戻り→確認を通すため。実際のインスタンスは
 * gate-auth.ts が、許可リストの照合と pino のログをつないで作る。
 *
 * アプリ内の lib/auth/auth.ts とは別のインスタンスで、DB は渡さない（ログイン状態は暗号化した Cookie に持つ）。
 */
import type { BetterAuthOptions } from 'better-auth';
import type { SiteGateSettings } from './config';
import {
  GATE_BASE_PATH,
  GATE_COOKIE_PREFIX,
  GATE_SESSION_TTL_SEC,
} from './constants';
import { GATE_DISABLED_PATHS } from './disabled-paths';
import { maskGateEmail, normalizeGateEmail } from './email';

/** 許可リストの照合の結果（allowlist.ts） */
export type GateAccess = 'allowed' | 'not_allowed' | 'stale_session';

type ValidateUserInfo = NonNullable<
  NonNullable<BetterAuthOptions['user']>['validateUserInfo']
>;
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** ログイン時の拒否のコード。組み込みのエラーページの ?error= に出る */
export const GATE_LOGIN_ERROR_CODES = {
  notAllowed: 'not_allowed',
  emailNotVerified: 'email_not_verified',
  temporarilyUnavailable: 'temporarily_unavailable',
} as const;

export interface GateUserInfoHooks {
  /** 正規化したアドレスが許可されているか。DB の障害では例外を投げる */
  checkAccess: (email: string) => Promise<GateAccess>;
  /** 拒否したとき（アドレスはローカル部を伏せた形で渡す） */
  onRejected: (reason: string, maskedEmail: string) => void;
  /** 照合が失敗したとき（例外を要約してログに出す。接続先を出さない） */
  onUnavailable: (error: unknown) => void;
}

/**
 * ログイン時の確認。Google であること、Gmail であること、Google がメールを確認済みであること、
 * 許可されていることの 4 つを確かめる。
 *
 * DB の例外はここで捕まえて temporarily_unavailable にする。例外のままだと Better Auth が自分のログに
 * 例外をそのまま出し（better-auth/dist/utils/validate-user-info.mjs）、DB に繋がらないときの文言には
 * 接続先が入りうるため。
 */
export function createValidateGateUserInfo(
  hooks: GateUserInfoHooks
): ValidateUserInfo {
  return async ({ user, source }) => {
    const email = normalizeGateEmail(
      typeof user.email === 'string' ? user.email : ''
    );
    if (source.method !== 'oauth' || source.oauth?.providerId !== 'google') {
      hooks.onRejected('provider', maskGateEmail(email ?? ''));
      return { error: GATE_LOGIN_ERROR_CODES.notAllowed };
    }
    if (email === null) {
      hooks.onRejected('not_gmail', '***');
      return { error: GATE_LOGIN_ERROR_CODES.notAllowed };
    }
    if (user.emailVerified !== true) {
      hooks.onRejected('email_not_verified', maskGateEmail(email));
      return { error: GATE_LOGIN_ERROR_CODES.emailNotVerified };
    }
    let access: GateAccess;
    try {
      access = await hooks.checkAccess(email);
    } catch (error) {
      hooks.onUnavailable(error);
      return { error: GATE_LOGIN_ERROR_CODES.temporarilyUnavailable };
    }
    if (access !== 'allowed') {
      hooks.onRejected('not_allowed', maskGateEmail(email));
      return { error: GATE_LOGIN_ERROR_CODES.notAllowed };
    }
    return undefined;
  };
}

const EMAIL_IN_TEXT = /[^\s@"'<>]+@[^\s@"'<>]+/g;

/**
 * Better Auth 自身のログの出力先。pino を通らず redact が効かないので、本文だけを、アドレスを伏せて渡す。
 * 引数（例外など）は渡さない（DB に繋がらないときの文言に接続先が入りうるため）
 */
export function toGateAuthLogger(
  log: (level: LogLevel, message: string) => void
): NonNullable<BetterAuthOptions['logger']> {
  return {
    level: 'warn',
    log: (level, message) => {
      const text = String(message)
        .replace(EMAIL_IN_TEXT, '[email]')
        .slice(0, 300);
      log(level, text);
    },
  };
}

export interface GateAuthOptionHooks {
  validateUserInfo: ValidateUserInfo;
  logger: NonNullable<BetterAuthOptions['logger']>;
}

/** 入口用の Better Auth の設定 */
export function createGateAuthOptions(
  settings: SiteGateSettings,
  hooks: GateAuthOptionHooks
) {
  return {
    // origin だけを渡す。パス付きの値だと basePath が無視され（better-auth/dist/utils/url.mjs）、
    // Google の戻り先がアプリ内の /api/auth/callback/google になる
    baseURL: settings.baseOrigin,
    basePath: GATE_BASE_PATH,
    // secret だけだと、空のとき BETTER_AUTH_SECRET・AUTH_SECRET（アプリ内の鍵）へ黙って切り替わり、
    // 環境に BETTER_AUTH_SECRETS があればそちらが優先される（better-auth/dist/context/create-context.mjs）。
    // 両方を明示して入口の鍵に固定する
    secret: settings.secret,
    secrets: [{ version: 1, value: settings.secret }],
    socialProviders: {
      google: {
        clientId: settings.clientId,
        clientSecret: settings.clientSecret,
        // 毎回アカウントを選び直せるようにする（許可されていないアカウントで入ったあと、別のアカウントで入り直せるように）
        prompt: 'select_account' as const,
        // ID トークンを直接送ってログインする経路を閉じる
        disableIdTokenSignIn: true,
      },
    },
    session: {
      expiresIn: GATE_SESSION_TTL_SEC,
      // 最初のログインから 7 日で切り、アクセスしても延ばさない。同じプロセスのメモリにセッションが残っていると、
      // これが無ければ期限が延びる（better-auth/dist/api/routes/session.mjs）
      disableSessionRefresh: true,
    },
    // 入口で使わない Google のトークンを Cookie に持たない（DB なしの既定は持つ）
    account: { storeAccountCookie: false },
    advanced: {
      cookiePrefix: GATE_COOKIE_PREFIX,
      useSecureCookies: settings.isProduction,
    },
    // 守りの本体は app/api/gate/[...all]/route.ts の完全一致。これは補助（disabled-paths.ts）
    disabledPaths: [...GATE_DISABLED_PATHS],
    // 本番（NODE_ENV=production）では、これが無いと /error が組み込みのページを返さず /?error=... へ移る
    // （better-auth/dist/api/routes/error.mjs）
    onAPIError: { customizeDefaultErrorPage: {} },
    // 戻りは Google とのコードの交換の前に state の Cookie を確かめ、開始には自前の制限がある
    // （app/api/gate/start/route.ts）。組み込みの制限は守りを足さず、回数のキーに basePath が入らない
    // 問題（アプリ内の Google ログインの戻りと回数を分け合う）だけを持ち込むので、切る
    rateLimit: { enabled: false },
    logger: hooks.logger,
    user: { validateUserInfo: hooks.validateUserInfo },
  } satisfies BetterAuthOptions;
}

/**
 * サイトの入口の設定の検証
 *
 * 生の環境変数の辞書を受ける 1 つの関数にまとめ、proxy.ts（process.env をリクエストごとに読む）と
 * Route Handler（lib/config/env.ts の値を渡す）の両方がここを通す。判定を二重に書いて食い違わないようにするため。
 * このモジュールは env.ts を読まない（proxy.ts とテストから実行時の値を渡せるようにするため）。
 */
import { normalizeGateEmail } from './email';

/** 呼び出し元が読み出して渡す環境変数の生の値 */
export interface SiteGateRawEnv {
  GATE_GOOGLE_ENABLED?: string;
  GATE_GOOGLE_CLIENT_ID?: string;
  GATE_GOOGLE_CLIENT_SECRET?: string;
  GATE_AUTH_SECRET?: string;
  GATE_ALWAYS_ALLOWED_EMAILS?: string;
  /** 移行の守り（Basic 認証の設定が残っていないか）にだけ使う */
  BASIC_AUTH_ENABLED?: string;
  /** Vercel が実行時に入れる環境の名前（production・preview・development） */
  VERCEL_ENV?: string;
  /** アプリ内のログインの鍵。入口の鍵と同じ値を使わせないために読む */
  AUTH_SECRET?: string;
  NEXTAUTH_SECRET?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  PORT?: string;
  NODE_ENV?: string;
}

/** 入口が有効なときに使う設定 */
export interface SiteGateSettings {
  clientId: string;
  clientSecret: string;
  secret: string;
  /** 設定で固定した許可アドレス（正規化済み、1 件以上） */
  fixedEmails: readonly string[];
  /** 入口の Better Auth の baseURL（origin だけ。パスを含めると basePath が無視される） */
  baseOrigin: string;
  /** NODE_ENV === 'production'。Cookie の __Secure- 接頭辞と Secure 属性に使う */
  isProduction: boolean;
}

export type SiteGateConfig =
  /** 入口が無効。何もしない */
  | { kind: 'disabled' }
  /** 有効なのに設定が足りない、または Basic 認証の設定が残っている。全ページを 503 にする */
  | { kind: 'misconfigured'; reason: string }
  | { kind: 'enabled'; settings: SiteGateSettings };

/** 入口の鍵の最低の長さ（Cookie の暗号化に使う） */
export const MIN_GATE_SECRET_LENGTH = 32;

type EnabledState = 'on' | 'off' | 'invalid' | 'unset';

/**
 * env.ts の booleanEnum と同じく trim と小文字化をしてから判定する（'TRUE' を無効と読み違えて全公開にしない）。
 * true・false 以外の値は設定の誤りとして、呼び出し元が 503 の側に倒す
 */
function readEnabledState(raw: string | undefined): EnabledState {
  if (raw === undefined) return 'unset';
  const normalized = raw.trim().toLowerCase();
  if (normalized === '') return 'unset';
  if (normalized === 'false') return 'off';
  if (normalized === 'true') return 'on';
  return 'invalid';
}

/** Basic 認証の設定が「無効」と読めない値で残っているか（不正な値も残っている側に倒す） */
function hasLegacyBasicAuth(raw: SiteGateRawEnv): boolean {
  const state = readEnabledState(raw.BASIC_AUTH_ENABLED);
  return state !== 'off' && state !== 'unset';
}

/**
 * 入口のフラグの状態。Vercel の Production では、未設定を有効とみなす（変数を消しただけで黙って全公開に
 * ならないように。入口を外すには false を明示する）
 */
function readGateState(raw: SiteGateRawEnv): EnabledState {
  const state = readEnabledState(raw.GATE_GOOGLE_ENABLED);
  if (state === 'unset' && raw.VERCEL_ENV?.trim() === 'production') return 'on';
  return state;
}

/**
 * 入口が有効になりうるか（route がキャッシュヘッダを決めるために使う）
 *
 * resolveSiteGateConfig と同じ規則で読み、不正な値や Basic 認証の設定の残りも「有効」の側に倒す。
 * 公開キャッシュを許すのは、入口が確実に無効のときだけにするため。
 */
export function isSiteGateEnabled(raw: SiteGateRawEnv): boolean {
  const state = readGateState(raw);
  if (state === 'on' || state === 'invalid') return true;
  return hasLegacyBasicAuth(raw);
}

function trimmed(value: string | undefined): string {
  return value?.trim() ?? '';
}

/** BETTER_AUTH_URL か NEXT_PUBLIC_APP_URL の origin。どちらも無ければ開発の既定、本番では null */
function resolveBaseOrigin(
  raw: SiteGateRawEnv,
  isProduction: boolean
): string | null | 'invalid' {
  const configured =
    trimmed(raw.BETTER_AUTH_URL) || trimmed(raw.NEXT_PUBLIC_APP_URL);
  if (configured === '') {
    if (isProduction) return null;
    const port = /^\d+$/.test(trimmed(raw.PORT)) ? trimmed(raw.PORT) : '3000';
    return `http://localhost:${port}`;
  }
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'invalid';
    return url.origin;
  } catch {
    return 'invalid';
  }
}

/** 固定の許可アドレスを読む。1 件でも Gmail の形でなければ null（どれが誤りかはログに値を出さず番号で示す） */
function parseFixedEmails(
  raw: string | undefined
): { emails: string[] } | { invalidIndexes: number[] } {
  const items = (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const emails: string[] = [];
  const invalidIndexes: number[] = [];
  items.forEach((item, index) => {
    const normalized = normalizeGateEmail(item);
    if (normalized === null) invalidIndexes.push(index + 1);
    else if (!emails.includes(normalized)) emails.push(normalized);
  });
  if (invalidIndexes.length > 0) return { invalidIndexes };
  return { emails };
}

/**
 * 入口の設定を読む。
 *
 * 1. 入口が有効でない（false、または Production 以外で未設定）: Basic 認証の設定が残っていれば
 *    misconfigured（Basic のコードを消したあと、Basic の設定だけが残った環境が全公開になるのを防ぐ）、
 *    残っていなければ disabled
 * 2. 有効なのに、ID・secret・固定アドレス・本番のベース URL のどれかが無い・不正なら misconfigured
 * 3. 入口の鍵がアプリ内の鍵と同じなら misconfigured（片方の漏えいが両方に及ばないように）
 */
export function resolveSiteGateConfig(raw: SiteGateRawEnv): SiteGateConfig {
  const state = readGateState(raw);
  if (state === 'invalid') {
    return {
      kind: 'misconfigured',
      reason: 'GATE_GOOGLE_ENABLED には true または false のみ指定できます',
    };
  }
  if (state !== 'on') {
    if (hasLegacyBasicAuth(raw)) {
      return {
        kind: 'misconfigured',
        reason:
          'BASIC_AUTH_ENABLED が残っていますが、Google ログインの入口（GATE_GOOGLE_ENABLED）が有効ではありません',
      };
    }
    return { kind: 'disabled' };
  }

  const isProduction = raw.NODE_ENV === 'production';
  const missing: string[] = [];

  const clientId = trimmed(raw.GATE_GOOGLE_CLIENT_ID);
  if (clientId === '') missing.push('GATE_GOOGLE_CLIENT_ID');
  const clientSecret = trimmed(raw.GATE_GOOGLE_CLIENT_SECRET);
  if (clientSecret === '') missing.push('GATE_GOOGLE_CLIENT_SECRET');

  const secret = trimmed(raw.GATE_AUTH_SECRET);
  if (secret.length < MIN_GATE_SECRET_LENGTH) {
    missing.push(`GATE_AUTH_SECRET (${MIN_GATE_SECRET_LENGTH}文字以上)`);
  } else if (
    [raw.AUTH_SECRET, raw.NEXTAUTH_SECRET, raw.BETTER_AUTH_SECRET].some(
      (appSecret) => trimmed(appSecret) === secret
    )
  ) {
    missing.push('GATE_AUTH_SECRET (アプリ内のログインの鍵と別の値にする)');
  }

  const fixed = parseFixedEmails(raw.GATE_ALWAYS_ALLOWED_EMAILS);
  if ('invalidIndexes' in fixed) {
    missing.push(
      `GATE_ALWAYS_ALLOWED_EMAILS (${fixed.invalidIndexes.join(', ')} 番目が Gmail アドレスではありません)`
    );
  } else if (fixed.emails.length === 0) {
    missing.push('GATE_ALWAYS_ALLOWED_EMAILS (Gmail アドレスを 1 件以上)');
  }

  const baseOrigin = resolveBaseOrigin(raw, isProduction);
  if (baseOrigin === null)
    missing.push('BETTER_AUTH_URL または NEXT_PUBLIC_APP_URL');
  else if (baseOrigin === 'invalid') {
    missing.push(
      'BETTER_AUTH_URL または NEXT_PUBLIC_APP_URL (URL の形ではありません)'
    );
  }

  if (
    missing.length > 0 ||
    baseOrigin === null ||
    baseOrigin === 'invalid' ||
    'invalidIndexes' in fixed
  ) {
    return {
      kind: 'misconfigured',
      reason: `未設定または不正な環境変数: ${missing.join(', ')}`,
    };
  }

  return {
    kind: 'enabled',
    settings: {
      clientId,
      clientSecret,
      secret,
      fixedEmails: fixed.emails,
      baseOrigin,
      isProduction,
    },
  };
}

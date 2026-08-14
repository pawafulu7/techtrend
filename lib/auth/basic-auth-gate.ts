import { createHash, createHmac } from 'crypto';
import type { NextRequest } from 'next/server';
import { compareSecrets } from '@/lib/utils/compare-secrets';

/**
 * サイト全体の Basic 認証ゲート。
 *
 * Basic 認証は「一度入力したら次から出ない」動作をブラウザの HTTP authentication entry に
 * 委ねており、その挙動は実装依存で環境差が大きい（Safari ではページ遷移毎にダイアログが
 * 再表示される事象が発生）。そこで認証成功時に HMAC 署名付き Cookie を発行し、以降は
 * Cookie で通すことでブラウザ実装差への依存をなくす。
 *
 * 設定値は proxy.ts と同様に process.env から都度読む。lib/config/env.ts はモジュール
 * ロード時に一度だけ parse するため、テストが実行時に process.env を書き換える方式と
 * 両立しない。
 */

/** Cookie フォーマットのバージョン。値の意味を変えたらインクリメントして旧 Cookie を一括失効させる */
const GATE_COOKIE_VERSION = 'v1';
const GATE_COOKIE_BASE_NAME = 'tt_gate';

/** 絶対 TTL（7日）。スライディング更新は行わない（更新し続けると実質無期限になるため） */
const GATE_TTL_SEC = 60 * 60 * 24 * 7;

/** 署名鍵の最低長。Cookie を入手した攻撃者によるオフライン総当たりを非現実的にするため */
const MIN_GATE_SECRET_LENGTH = 32;

/** RFC 7617: charset を通知しないと非 ASCII 資格情報の相互運用性が保証されない */
export const BASIC_AUTH_CHALLENGE = 'Basic realm="Protected", charset="UTF-8"';

export type GateOutcome =
  /** Basic 認証 OFF。ゲートは何もしない */
  | { kind: 'disabled' }
  /** cron Bearer 一致。通すが Cookie は発行しない */
  | { kind: 'cron' }
  /** 有効化されているのに資格情報 or 署名鍵が欠落。fail-closed で 503 */
  | { kind: 'misconfigured' }
  /** 有効なゲート Cookie。通すが Cookie は再発行しない */
  | { kind: 'cookie' }
  /** Basic 認証成功。通してゲート Cookie を発行（＝旧 Cookie を上書き）する */
  | { kind: 'basic' }
  /** 401 challenge を返す */
  | { kind: 'fail' };

interface GateConfig {
  user: string;
  pass: string;
  secret: string;
}

function readConfig(): GateConfig {
  return {
    user: process.env.BASIC_AUTH_USER || 'user',
    pass: process.env.BASIC_AUTH_PASS || process.env.BASIC_PASSWORD || '',
    secret: process.env.BASIC_AUTH_GATE_SECRET || '',
  };
}

function isConfigured(config: GateConfig): boolean {
  return (
    config.pass.length > 0 && config.secret.length >= MIN_GATE_SECRET_LENGTH
  );
}

/**
 * Cookie 名は関数内で都度決定する。モジュールロード時に確定させると
 * production 属性（__Host- prefix）をテストで検証できなくなる。
 */
export function gateCookieName(): string {
  return process.env.NODE_ENV === 'production'
    ? `__Host-${GATE_COOKIE_BASE_NAME}`
    : GATE_COOKIE_BASE_NAME;
}

/**
 * 現行の資格情報の指紋。署名対象に含めることで、user/pass を変更するだけで
 * 既存の全 Cookie が検証に失敗するようになる（＝即時失効手段になる）。
 *
 * user の長さを前置して user="a:b", pass="c" と user="a", pass="b:c" を区別する。
 */
function credentialFingerprint(config: GateConfig): string {
  return createHash('sha256')
    .update(`${config.user.length}:${config.user}:${config.pass}`, 'utf8')
    .digest('hex');
}

function sign(exp: number, config: GateConfig): string {
  const message = `${GATE_COOKIE_VERSION}.${exp}.${credentialFingerprint(config)}`;
  return createHmac('sha256', config.secret)
    .update(message, 'utf8')
    .digest('base64url');
}

function verifyGateCookie(
  value: string | undefined,
  config: GateConfig
): boolean {
  if (!value) return false;

  const parts = value.split('.');
  if (parts.length !== 3) return false;

  const [version, expRaw, signature] = parts;
  if (version !== GATE_COOKIE_VERSION) return false;
  if (!/^\d+$/.test(expRaw)) return false;

  const exp = Number(expRaw);
  if (!Number.isSafeInteger(exp)) return false;
  if (exp * 1000 <= Date.now()) return false;

  return compareSecrets(signature, sign(exp, config));
}

function isSecureRequest(request: NextRequest): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    request.nextUrl.protocol === 'https:'
  );
}

/**
 * Set-Cookie の値を組み立てる。
 *
 * NextResponse.cookies.set() は使わない。__mocks__/next/server.ts の NextResponse には
 * cookies API が実装されておらず、テストが実行時エラーになるため。
 * 自前でシリアライズすることで __Host- prefix の要件（Domain を出力しない）も確実に守れる。
 */
export function buildGateSetCookie(request: NextRequest): string {
  const config = readConfig();
  const exp = Math.floor(Date.now() / 1000) + GATE_TTL_SEC;
  const value = `${GATE_COOKIE_VERSION}.${exp}.${sign(exp, config)}`;

  const attributes = [
    `${gateCookieName()}=${value}`,
    'Path=/',
    `Max-Age=${GATE_TTL_SEC}`,
    'HttpOnly',
    'SameSite=Lax',
  ];

  // __Host- prefix は Secure を要求する。ローカルの http 開発を壊さないため条件付きにする。
  if (isSecureRequest(request)) {
    attributes.push('Secure');
  }

  // Domain は出力しない（__Host- prefix の要件であり、サブドメインへの漏出も防ぐ）
  return attributes.join('; ');
}

/** 標準 Base64（padding 込み）のみを許容する */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;

/**
 * Base64 をバイト列として厳密にデコードし、UTF-8 として解釈する。
 *
 * Buffer.from(x, 'base64') は不正な入力を黙って受理する（不正文字を読み飛ばす）ため、
 * 文字種・padding を検証したうえで往復比較する。
 */
function decodeBase64Strict(token: string): string | null {
  if (token.length === 0 || token.length % 4 !== 0) return null;
  if (!BASE64_PATTERN.test(token)) return null;

  const buffer = Buffer.from(token, 'base64');
  if (buffer.toString('base64') !== token) return null;

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    // 不正な UTF-8 バイト列
    return null;
  }
}

interface BasicCredentials {
  user: string;
  pass: string;
}

/**
 * RFC 7617 に従って Authorization: Basic をパースする。
 * - スキーム名は case-insensitive
 * - token は単一（余分なトークンがあれば不正）
 * - 最初の ':' より後ろが全て password。user-id に ':' は含められない
 */
function parseBasicHeader(header: string | null): BasicCredentials | null {
  if (!header) return null;

  const match = /^Basic[ \t]+([^ \t]+)[ \t]*$/i.exec(header);
  if (!match) return null;

  const decoded = decodeBase64Strict(match[1]);
  if (decoded === null) return null;

  const separator = decoded.indexOf(':');
  if (separator < 0) return null;

  const user = decoded.slice(0, separator);
  const pass = decoded.slice(separator + 1);

  if (CONTROL_CHAR_PATTERN.test(user) || CONTROL_CHAR_PATTERN.test(pass))
    return null;

  return { user, pass };
}

function matchesBasicCredentials(
  header: string | null,
  config: GateConfig
): boolean {
  const parsed = parseBasicHeader(header);
  if (!parsed) return false;

  // 短絡評価を避け、user 側の一致有無が応答時間から観測できないようにする
  const userMatches = compareSecrets(parsed.user, config.user);
  const passMatches = compareSecrets(parsed.pass, config.pass);
  return userMatches && passMatches;
}

function matchesCronBearer(header: string | null): boolean {
  const cronSecret = process.env.CRON_TOKEN || process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const match = /^Bearer[ \t]+([^ \t]+)[ \t]*$/i.exec(header ?? '');
  if (!match) return false;

  return compareSecrets(match[1], cronSecret);
}

/**
 * ゲートの判定。評価順序は以下の通り。
 *
 * 1. Basic 認証 OFF → disabled
 * 2. cron Bearer → cron（設定不備チェックより前。ゲートの設定ミスでバッチを止めないため）
 * 3. 資格情報 or 署名鍵の欠落 → misconfigured（fail-closed）
 * 4. 有効なゲート Cookie → cookie
 * 5. 正しい Basic ヘッダ → basic
 * 6. → fail
 *
 * 4 が失敗しても打ち切らずに 5 へ進むのが重要。ここで終端すると、不正・失効した Cookie を
 * 持つ利用者が正しい資格情報を入力しても Cookie を上書きできず 401 ループに陥る。
 */
export function evaluateGate(request: NextRequest): GateOutcome {
  if (process.env.BASIC_AUTH_ENABLED !== 'true') return { kind: 'disabled' };

  const authHeader = request.headers.get('authorization');

  if (matchesCronBearer(authHeader)) return { kind: 'cron' };

  const config = readConfig();
  if (!isConfigured(config)) return { kind: 'misconfigured' };

  if (verifyGateCookie(request.cookies.get(gateCookieName())?.value, config)) {
    return { kind: 'cookie' };
  }

  if (matchesBasicCredentials(authHeader, config)) return { kind: 'basic' };

  return { kind: 'fail' };
}

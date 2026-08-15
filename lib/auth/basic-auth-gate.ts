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
 * 環境変数はこのモジュールでは読まず、呼び出し元（proxy.ts）が GateEnv として渡す。
 * lib/config/env.ts はモジュールロード時に一度だけ parse するためテストの実行時書き換えと
 * 両立せず、かつ lib/ 配下は process.env の直接参照を ESLint で禁止しているため。
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

/** 呼び出し元が読み出して渡す環境変数の生値 */
export interface GateEnv {
  /** BASIC_AUTH_ENABLED */
  enabled: string | undefined;
  /** BASIC_AUTH_USER */
  user: string | undefined;
  /** BASIC_AUTH_PASS */
  pass: string | undefined;
  /** BASIC_PASSWORD（旧名） */
  legacyPass: string | undefined;
  /** BASIC_AUTH_GATE_SECRET */
  gateSecret: string | undefined;
  /** CRON_TOKEN または CRON_SECRET */
  cronSecret: string | undefined;
  /** NODE_ENV === 'production'。Cookie の prefix と Secure 属性の判定に使う */
  isProduction: boolean;
}

export type GateOutcome =
  /** Basic 認証 OFF。ゲートは何もしない */
  | { kind: 'disabled' }
  /** cron Bearer 一致。通すが Cookie は発行しない */
  | { kind: 'cron' }
  /** 有効化されているのに設定が不完全。fail-closed で 503 */
  | { kind: 'misconfigured'; reason: string }
  /** 有効なゲート Cookie。通すが Cookie は再発行しない */
  | { kind: 'cookie' }
  /** Basic 認証成功。通してゲート Cookie を発行（＝旧 Cookie を上書き）する */
  | { kind: 'basic' }
  /** 401 challenge を返す */
  | { kind: 'fail' };

interface ResolvedConfig {
  user: string;
  pass: string;
  secret: string;
}

/**
 * RFC 7617 は charset="UTF-8" を通知した場合に NFC を期待する。設定値と受信値の双方を
 * NFC に揃えないと、見た目が同じ資格情報でも合成形/分解形の違いで認証に失敗する。
 */
function resolveConfig(gateEnv: GateEnv): ResolvedConfig {
  return {
    user: (gateEnv.user || 'user').normalize('NFC'),
    pass: (gateEnv.pass || gateEnv.legacyPass || '').normalize('NFC'),
    secret: gateEnv.gateSecret || '',
  };
}

type EnabledState = 'on' | 'off' | 'invalid';

/**
 * env.ts の booleanEnum と同じく trim + lowercase で判定する。
 * 'TRUE' や ' true ' を OFF と誤判定してサイトが全公開になるのを防ぐ。
 * true/false 以外の値は設定ミスとして fail-closed 側に倒す。
 */
function readEnabledState(raw: string | undefined): EnabledState {
  if (raw === undefined) return 'off';

  const normalized = raw.trim().toLowerCase();
  if (normalized === '' || normalized === 'false') return 'off';
  if (normalized === 'true') return 'on';
  return 'invalid';
}

function missingSettings(config: ResolvedConfig): string[] {
  const missing: string[] = [];
  if (config.pass.length === 0) missing.push('BASIC_AUTH_PASS');
  if (config.secret.length < MIN_GATE_SECRET_LENGTH) {
    missing.push(`BASIC_AUTH_GATE_SECRET (${MIN_GATE_SECRET_LENGTH}文字以上)`);
  }
  return missing;
}

/**
 * Cookie 名は呼び出し時に決定する。モジュールロード時に確定させると
 * production 属性（__Host- prefix）をテストで検証できなくなる。
 */
export function gateCookieName(isProduction: boolean): string {
  return isProduction
    ? `__Host-${GATE_COOKIE_BASE_NAME}`
    : GATE_COOKIE_BASE_NAME;
}

/**
 * 現行の資格情報の指紋。署名対象に含めることで、user/pass を変更するだけで
 * 既存の全 Cookie が検証に失敗するようになる（＝即時失効手段になる）。
 *
 * user の長さを前置して user="a:b", pass="c" と user="a", pass="b:c" を区別する。
 */
function credentialFingerprint(config: ResolvedConfig): string {
  return createHash('sha256')
    .update(`${config.user.length}:${config.user}:${config.pass}`, 'utf8')
    .digest('hex');
}

function sign(exp: number, config: ResolvedConfig): string {
  const message = `${GATE_COOKIE_VERSION}.${exp}.${credentialFingerprint(config)}`;
  return createHmac('sha256', config.secret)
    .update(message, 'utf8')
    .digest('base64url');
}

function verifyGateCookie(
  value: string | undefined,
  config: ResolvedConfig
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

function isSecureRequest(request: NextRequest, isProduction: boolean): boolean {
  return isProduction || request.nextUrl.protocol === 'https:';
}

/**
 * Set-Cookie の値を組み立てる。
 *
 * NextResponse.cookies.set() は使わない。__mocks__/next/server.ts の NextResponse には
 * cookies API が実装されておらず、テストが実行時エラーになるため。
 * 自前でシリアライズすることで __Host- prefix の要件（Domain を出力しない）も確実に守れる。
 */
export function buildGateSetCookie(
  request: NextRequest,
  gateEnv: GateEnv
): string {
  const config = resolveConfig(gateEnv);
  const exp = Math.floor(Date.now() / 1000) + GATE_TTL_SEC;
  const value = `${GATE_COOKIE_VERSION}.${exp}.${sign(exp, config)}`;

  const attributes = [
    `${gateCookieName(gateEnv.isProduction)}=${value}`,
    'Path=/',
    `Max-Age=${GATE_TTL_SEC}`,
    'HttpOnly',
    'SameSite=Lax',
  ];

  // __Host- prefix は Secure を要求する。ローカルの http 開発を壊さないため条件付きにする。
  if (isSecureRequest(request, gateEnv.isProduction)) {
    attributes.push('Secure');
  }

  // Domain は出力しない（__Host- prefix の要件であり、サブドメインへの漏出も防ぐ）
  return attributes.join('; ');
}

/** 標準 Base64（padding 込み）のみを許容する */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

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

const BASIC_SCHEME_PATTERN = /^Basic[ \t]+([^ \t]+)[ \t]*$/i;
const BEARER_SCHEME_PATTERN = /^Bearer[ \t]+([^ \t]+)[ \t]*$/i;

/**
 * Authorization ヘッダから token を取り出す共通パーサー。
 * Basic / Bearer で同じ形式・同じ検証（scheme は RFC 7235 上 case-insensitive、
 * token は単一、制御文字を含まない）を適用するために 1 箇所に集約している。
 */
function extractAuthToken(
  header: string | null,
  schemePattern: RegExp
): string | null {
  if (!header) return null;

  const match = schemePattern.exec(header);
  if (!match) return null;

  const token = match[1];
  if (CONTROL_CHAR_PATTERN.test(token)) return null;

  return token;
}

/**
 * RFC 7617 に従って Authorization: Basic をパースする。
 * - 最初の ':' より後ろが全て password。user-id に ':' は含められない
 * - charset="UTF-8" を通知しているため NFC に正規化する
 */
function parseBasicHeader(header: string | null): BasicCredentials | null {
  const token = extractAuthToken(header, BASIC_SCHEME_PATTERN);
  if (token === null) return null;

  const decoded = decodeBase64Strict(token);
  if (decoded === null) return null;

  const separator = decoded.indexOf(':');
  if (separator < 0) return null;

  const user = decoded.slice(0, separator);
  const pass = decoded.slice(separator + 1);

  if (CONTROL_CHAR_PATTERN.test(user) || CONTROL_CHAR_PATTERN.test(pass)) {
    return null;
  }

  return { user: user.normalize('NFC'), pass: pass.normalize('NFC') };
}

function matchesBasicCredentials(
  header: string | null,
  config: ResolvedConfig
): boolean {
  const parsed = parseBasicHeader(header);
  if (!parsed) return false;

  // 短絡評価を避け、user 側の一致有無が応答時間から観測できないようにする
  const userMatches = compareSecrets(parsed.user, config.user);
  const passMatches = compareSecrets(parsed.pass, config.pass);
  return userMatches && passMatches;
}

function matchesCronBearer(
  header: string | null,
  cronSecret: string | undefined
): boolean {
  if (!cronSecret) return false;

  const token = extractAuthToken(header, BEARER_SCHEME_PATTERN);
  if (token === null) return false;

  return compareSecrets(token, cronSecret);
}

/**
 * ゲートの判定。評価順序は以下の通り。
 *
 * 1. Basic 認証 OFF → disabled
 * 2. cron Bearer → cron（設定不備チェックより前。ゲートの設定ミスでバッチを止めないため）
 * 3. 設定が不完全 → misconfigured（fail-closed）
 * 4. 有効なゲート Cookie → cookie
 * 5. 正しい Basic ヘッダ → basic
 * 6. → fail
 *
 * 4 が失敗しても打ち切らずに 5 へ進むのが重要。ここで終端すると、不正・失効した Cookie を
 * 持つ利用者が正しい資格情報を入力しても Cookie を上書きできず 401 ループに陥る。
 */
export function evaluateGate(
  request: NextRequest,
  gateEnv: GateEnv
): GateOutcome {
  const enabled = readEnabledState(gateEnv.enabled);
  if (enabled === 'off') return { kind: 'disabled' };

  const authHeader = request.headers.get('authorization');
  if (matchesCronBearer(authHeader, gateEnv.cronSecret))
    return { kind: 'cron' };

  if (enabled === 'invalid') {
    return {
      kind: 'misconfigured',
      reason: 'BASIC_AUTH_ENABLED には true または false のみ指定できます',
    };
  }

  const config = resolveConfig(gateEnv);
  const missing = missingSettings(config);
  if (missing.length > 0) {
    return {
      kind: 'misconfigured',
      reason: `未設定または不正な環境変数: ${missing.join(', ')}`,
    };
  }

  const cookieValue = request.cookies.get(
    gateCookieName(gateEnv.isProduction)
  )?.value;
  if (verifyGateCookie(cookieValue, config)) {
    return { kind: 'cookie' };
  }

  if (matchesBasicCredentials(authHeader, config)) return { kind: 'basic' };

  return { kind: 'fail' };
}

/**
 * 記事ページの取得（lib/enrichers）で使う、転送の各段を検証しながらたどる fetch と、
 * 大きさに上限を付けた本文の読み込み。
 *
 * fetch の `redirect: 'follow'` は最初の URL を検証しても、転送先（例: 公開サイトから
 * 169.254.169.254 への 302）を検証しない。ここでは `redirect: 'manual'` で1段ずつ取り、
 * 各段の前に assertPublicHttpUrl（DNS 解決を含む）を通す。
 *
 * - 方法は GET・HEAD だけ（本文つきの要求は扱わない）。どの転送でも方法を保つ
 * - 別のオリジンへ移るときは、資格情報になりうるヘッダを落とす（undici の follow と同じ）
 * - 自分で DNS を持つ攻撃者の DNS rebinding（検証と接続で違う答えを返す）は防げない。
 *   ssrf-guard.ts のスコープ外の欄を参照
 */

import { assertPublicHttpUrl, SsrfGuardError } from './ssrf-guard';

export const DEFAULT_MAX_REDIRECTS = 5;
export const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const CROSS_ORIGIN_STRIPPED_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'host',
]);

export interface SafeFetchOptions {
  /** 既定 GET */
  method?: 'GET' | 'HEAD';
  headers?: Record<string, string>;
  /** 全段と本文の読み込みで共有する */
  signal?: AbortSignal;
  /** たどる転送の最大数。既定 5 */
  maxRedirects?: number;
  /** assertPublicHttpUrl のログに渡す */
  context?: Record<string, unknown>;
  /** 最初の URL と転送先がすべて https でなければ InvalidRedirectError（フィードの改ざんを防ぐ） */
  httpsOnly?: boolean;
}

export interface SafeFetchResult {
  /** 最後の応答。本文は readTextWithLimit で読む */
  response: Response;
  /** その応答の URL */
  finalUrl: string;
}

/** 転送の数が上限を超えた */
export class RedirectLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedirectLimitError';
  }
}

/** Location が URL として壊れている、資格情報を含む、http/https 以外（最初の URL が資格情報を含むときも） */
export class InvalidRedirectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRedirectError';
  }
}

/** 本文が上限を超えた */
export class ResponseTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResponseTooLargeError';
  }
}

/** 再試行しても結果が変わらない失敗か */
export function isNonRetryableFetchError(error: unknown): boolean {
  return (
    error instanceof SsrfGuardError ||
    error instanceof RedirectLimitError ||
    error instanceof InvalidRedirectError ||
    error instanceof ResponseTooLargeError
  );
}

/**
 * 各段で assertPublicHttpUrl を通してから `redirect: 'manual'` で取得し、Location をたどる。
 * 301・302・303・307・308 以外の応答と、Location の無い応答は、たどらずにそのまま返す。
 *
 * @throws {SsrfGuardError} いずれかの段の URL が拒否されたとき
 * @throws {InvalidRedirectError} Location が不正なとき
 * @throws {RedirectLimitError} 転送の数が上限を超えたとき
 */
export async function fetchWithValidatedRedirects(
  url: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const {
    method = 'GET',
    signal,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    context,
    httpsOnly = false,
  } = options;
  let headers: Record<string, string> = { ...(options.headers ?? {}) };
  let currentUrl = url;
  rejectCredentials(url);

  for (let redirects = 0; ; redirects++) {
    signal?.throwIfAborted();
    if (httpsOnly && new URL(currentUrl).protocol !== 'https:') {
      throw new InvalidRedirectError(`Non-HTTPS URL is not fetched: ${new URL(currentUrl).origin}`);
    }
    // DNS の名前解決は signal を受けないので、中断されたら待たずに抜ける
    await abortable(assertPublicHttpUrl(currentUrl, context), signal);

    const response = await fetch(currentUrl, {
      method,
      headers,
      signal,
      redirect: 'manual',
    });

    const location = REDIRECT_STATUSES.has(response.status)
      ? response.headers?.get('location')
      : null;
    if (!location) {
      return { response, finalUrl: currentUrl };
    }

    await releaseBody(response);

    if (redirects >= maxRedirects) {
      throw new RedirectLimitError(
        `Too many redirects (more than ${maxRedirects}) starting from ${url}`
      );
    }

    const nextUrl = resolveRedirectTarget(location, currentUrl);
    if (new URL(nextUrl).origin !== new URL(currentUrl).origin) {
      headers = stripCrossOriginHeaders(headers);
    }
    currentUrl = nextUrl;
  }
}

/**
 * 本文を UTF-8 の文字列として読む（Response.text() と同じ）。展開後のバイト数が上限を
 * 超えたら読むのをやめて ResponseTooLargeError を投げる。Content-Length が上限を超える
 * ときは読まない。
 */
export async function readTextWithLimit(
  response: Response,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES
): Promise<string> {
  const declaredLength = Number(response.headers?.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await releaseBody(response);
    throw new ResponseTooLargeError(
      `Content-Length ${declaredLength} exceeds the limit of ${maxBytes} bytes`
    );
  }

  const body = response.body as unknown;
  if (!isReadableStream(body)) {
    // テストの Response のモックなど、本文がストリームでないもの
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new ResponseTooLargeError(
        `Response body exceeds the limit of ${maxBytes} bytes`
      );
    }
    return text;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ResponseTooLargeError(
        `Response body exceeds the limit of ${maxBytes} bytes`
      );
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

function resolveRedirectTarget(location: string, baseUrl: string): string {
  let target: URL;
  try {
    target = new URL(location, baseUrl);
  } catch {
    throw new InvalidRedirectError(`Invalid redirect location from ${baseUrl}`);
  }
  if (!ALLOWED_PROTOCOLS.has(target.protocol)) {
    throw new InvalidRedirectError(
      `Disallowed redirect protocol "${target.protocol}" from ${baseUrl}`
    );
  }
  if (target.username || target.password) {
    throw new InvalidRedirectError(
      `Redirect location with credentials from ${baseUrl}`
    );
  }
  return target.toString();
}

/** 資格情報を含む URL は取らない（ログやヘッダに資格情報が出るのを防ぐ。メッセージに URL を入れない） */
function rejectCredentials(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return; // 壊れた URL は assertPublicHttpUrl が invalid_url で拒否する
  }
  if (parsed.username || parsed.password) {
    throw new InvalidRedirectError('URL with credentials is not fetched');
  }
}

/** signal が中断されたら、promise の完了を待たずに中断の理由で reject する */
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

function stripCrossOriginHeaders(
  headers: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => !CROSS_ORIGIN_STRIPPED_HEADERS.has(name.toLowerCase())
    )
  );
}

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ReadableStream).getReader === 'function'
  );
}

/** 転送や拒否の応答の本文を読まずに捨て、接続を返す */
async function releaseBody(response: Response): Promise<void> {
  try {
    const body = response.body as unknown;
    if (isReadableStream(body)) {
      await body.cancel();
    }
  } catch {
    // 本文の破棄の失敗は呼び出し側の判定に影響させない
  }
}

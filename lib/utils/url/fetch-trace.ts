/**
 * ある処理の中で行った記事ページの取得（safe-redirect.ts）の、最後の結果を覚える。
 *
 * enricher は取得に失敗しても null を返すだけで（throw しない契約）、HTTP のステータスや、
 * 本文が大きすぎて捨てたことを呼び出し元に伝えない。enricher ごとの戻り値を変えずに失敗の理由を
 * 残すため、取得の共通処理が AsyncLocalStorage に書き、traceFetches の呼び出し元が読む。
 * traceFetches の外で行った取得は何も記録しない。
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/** 応答を得られなかった取得の分類 */
export type FetchErrorCode =
  /** 本文が上限（DEFAULT_MAX_BODY_BYTES）を超えた */
  | 'TOO_LARGE'
  /** SSRF の検証で拒否した（内部の IP に解決する・http/https 以外など。名前解決の失敗は NETWORK） */
  | 'SSRF_REJECTED'
  /** 転送先が不正、または転送の数が上限を超えた */
  | 'REDIRECT_REJECTED'
  /** 時間切れ・中断 */
  | 'TIMEOUT'
  /** 名前解決・接続・TLS などの失敗 */
  | 'NETWORK';

export type FetchOutcome =
  | {
      kind: 'response';
      status: number;
      /** Cloudflare の確認ページ（`cf-mitigated: challenge`）。ボット対策で止められた */
      challenge: boolean;
    }
  | {
      kind: 'error';
      code: FetchErrorCode;
      /**
       * 原因のコード（ENOTFOUND などの接続の失敗、SSRF の検証の理由）。メッセージは接続先が
       * 入りうるので持たない
       */
      cause?: string;
    };

interface FetchTrace {
  last?: FetchOutcome;
}

const storage = new AsyncLocalStorage<FetchTrace>();

/**
 * fn の中で行った取得の、最後の結果と一緒に fn の結果を返す。fn が投げた例外はそのまま投げる
 * （呼び出し元が分類する）。並行に動く別の traceFetches とは記録が混ざらない
 */
export async function traceFetches<T>(
  fn: () => Promise<T>
): Promise<{ value: T; lastFetch?: FetchOutcome }> {
  const trace: FetchTrace = {};
  const value = await storage.run(trace, fn);
  return { value, lastFetch: trace.last };
}

/** 実行中の traceFetches に取得の結果を記録する。traceFetches の外では何もしない */
export function recordFetchOutcome(outcome: FetchOutcome): void {
  const trace = storage.getStore();
  if (trace) trace.last = outcome;
}

const TIMEOUT_CAUSE_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'ETIMEDOUT',
]);

/**
 * fetch・本文の読み込みが投げた例外を分類する。中断の理由（signal.reason）は Error でないことも
 * あるので、name は instanceof を使わずに読む。cause.code は undici・Node が付ける ENOTFOUND など
 */
export function fetchErrorOutcome(error: unknown): FetchOutcome {
  const { name, cause } = (error ?? {}) as {
    name?: unknown;
    cause?: { code?: unknown };
  };
  if (name === 'AbortError' || name === 'TimeoutError') {
    return { kind: 'error', code: 'TIMEOUT' };
  }
  const causeCode = typeof cause?.code === 'string' ? cause.code : undefined;
  return {
    kind: 'error',
    // undici は接続・応答ヘッダ・本文の時間切れを TypeError の cause.code で知らせる
    code: causeCode && TIMEOUT_CAUSE_CODES.has(causeCode) ? 'TIMEOUT' : 'NETWORK',
    ...(causeCode && { cause: causeCode }),
  };
}

/**
 * 毎時の収集（collect-feeds.ts）で、記事ページから本文を取れなかった理由をまとめ、ログと DB に残す。
 *
 * enricher は失敗しても null を返すだけなので、理由が残らないと、取得失敗（CONTENT_FETCH_FAILED）の
 * 記事がボット対策で止められたのか、一時的な失敗なのか、ページから本文を抜き出せなかったのかを
 * 区別できない。取得の共通処理が覚えた最後の結果（lib/utils/url/fetch-trace.ts）から理由を決める。
 */
import { prisma } from '@/lib/prisma';
import type { EnrichmentResult, IContentEnricher } from '@/lib/enrichers';
import {
  classifyEnrichmentError,
  type EnrichmentErrorCode,
} from '@/lib/enrichers/error-classifier';
import { createLogger } from '@/lib/logger';
import { validateArticleContent } from '@/lib/summary/summary-orchestrator';
import { CONTENT_FETCH_FAILURE_PREFIX } from '@/lib/summary/pending-articles';
import {
  traceFetches,
  type FetchErrorCode,
  type FetchOutcome,
} from '@/lib/utils/url/fetch-trace';
import { isYouTubeVideoUrl } from '@/lib/utils/url/youtube';
import { runWithTimeout } from './run-with-timeout';
import { contentStateWhere } from './summary-reset';

const logger = createLogger('collect-feeds');

/** enricher を1回呼んだ結果。enricher の例外はここで受け止める */
export interface EnrichmentAttempt {
  /** enricher の戻り値。例外のときは null */
  data: EnrichmentResult | null;
  /** enricher が投げた例外（時間切れを含む）。キーがあれば例外（undefined で reject されたときも） */
  error?: unknown;
  /** enricher の中で行った最後の取得の結果 */
  lastFetch?: FetchOutcome;
}

/**
 * 本文を取れなかった理由の分類。
 * - HTTP_<status>・TIMEOUT・ABORTED・EXCEPTION・NO_DATA: enricher の例外の分類（error-classifier.ts）。
 *   NO_DATA は enricher が取得の記録を残さずに何も返さないとき
 * - TOO_LARGE・SSRF_REJECTED・REDIRECT_REJECTED・NETWORK: 取得の失敗（fetch-trace.ts）
 * - NO_CONTENT: 応答は得たが、本文を抜き出せない、または enricher が短い・案内ページとして捨てた
 * - THIN: enricher は本文を返したが、短い・品質が足りず保存しない
 */
export type EnrichmentFailureCode =
  | EnrichmentErrorCode
  | FetchErrorCode
  | 'NO_CONTENT'
  | 'THIN';

/** 本文を取れなかった理由 */
export interface EnrichmentFailure {
  errorCode: EnrichmentFailureCode;
  status?: number;
  /** 補足。challenge（ボット対策の確認ページ）・ENOTFOUND などの原因のコード・本文の文字数 */
  detail?: string;
  /** enricher が投げた例外の名前（ログだけに出す） */
  errorName?: string;
}

/** 時間の上限を付けて enricher を呼び、取得の結果と一緒に返す（例外は投げない） */
export async function enrichWithTrace(
  enricher: IContentEnricher,
  url: string,
  timeoutMs: number,
  timeoutMessage: string
): Promise<EnrichmentAttempt> {
  const { value, lastFetch } = await traceFetches(
    async (): Promise<Omit<EnrichmentAttempt, 'lastFetch'>> => {
      try {
        const data = await runWithTimeout(
          (signal) => enricher.enrich(url, signal),
          timeoutMs,
          timeoutMessage
        );
        return { data };
      } catch (error) {
        return { data: null, error };
      }
    }
  );
  return { ...value, lastFetch };
}

function failureFromFetch(lastFetch: FetchOutcome | undefined): EnrichmentFailure {
  if (!lastFetch) return { errorCode: 'NO_DATA' };
  if (lastFetch.kind === 'error') {
    return {
      errorCode: lastFetch.code,
      ...(lastFetch.cause && { detail: lastFetch.cause }),
    };
  }
  const { status, challenge } = lastFetch;
  return {
    errorCode: status >= 200 && status < 300 ? 'NO_CONTENT' : `HTTP_${status}`,
    status,
    ...(challenge && { detail: 'challenge' }),
  };
}

/**
 * 本文を保存できなかった試行の理由を決める。
 * rejectedContentLength は、enricher が本文を返したが短い・品質が足りないので保存しなかったときの文字数
 */
export function describeEnrichmentFailure(
  attempt: EnrichmentAttempt,
  rejectedContentLength?: number
): EnrichmentFailure {
  if ('error' in attempt) {
    const classified = classifyEnrichmentError(attempt.error);
    // 取得の失敗が enricher の例外になったとき（HTTP のステータスも時間切れも読めない）は、
    // 取得の結果の方が詳しい
    if (classified.errorCode === 'EXCEPTION' && attempt.lastFetch) {
      return failureFromFetch(attempt.lastFetch);
    }
    return {
      errorCode: classified.errorCode,
      ...(classified.status !== undefined && { status: classified.status }),
      ...(classified.errorName && { errorName: classified.errorName }),
    };
  }
  if (rejectedContentLength !== undefined) {
    return { errorCode: 'THIN', detail: `${rejectedContentLength}文字` };
  }
  return failureFromFetch(attempt.lastFetch);
}

/** summaryError に入れる文。管理画面の記事の詳細に出る */
export function formatEnrichmentFailure(
  failure: EnrichmentFailure,
  enricherName: string
): string {
  const detail = failure.detail ? ` (${failure.detail})` : '';
  return `${CONTENT_FETCH_FAILURE_PREFIX}${failure.errorCode}${detail} [${enricherName}]`;
}

/**
 * 新しい記事の保存の後の取得で、取れなかったことを失敗として報告するか。
 * 本文を採らなかったときのうち、enricher が本文を返さなかったとき（取得の失敗）と、フィードの本文が
 * 要約に足りないとき。フィードの本文で要約できる記事に、それより短い本文が返っただけのとき
 * （よくある）は失敗として扱わない
 */
export function shouldReportPostSaveFailure({
  contentAccepted,
  enrichedContent,
  feedContent,
}: {
  contentAccepted: boolean;
  enrichedContent: string | null | undefined;
  feedContent: string | null | undefined;
}): boolean {
  if (contentAccepted) return false;
  if (!enrichedContent) return true;
  return !validateArticleContent({ content: feedContent ?? null }).valid;
}

interface ReportEnrichmentFailureParams {
  /** 本文の状態（contentLength・contentUpdatedAt）は読んだときの値。書く前に変わっていたら書かない */
  article: {
    id: string;
    url: string;
    contentLength: number | null;
    contentUpdatedAt: Date | null;
  };
  /** 失敗した後に残る本文（フィードの本文など）。要約に足りるなら DB には書かない */
  remainingContent: string | null | undefined;
  failure: EnrichmentFailure;
  enricherName: string;
  sourceId: string;
  sourceName: string;
  /** post-save（新しい記事）か self-heal（本文の無い既存記事の取り直し） */
  phase: 'post-save' | 'self-heal';
}

/**
 * 本文を取れなかった理由をログに出し、要約を作れない記事なら summaryError に書く。
 *
 * 書くのは、残る本文が要約に足りない（取得失敗・本文不足の印が付く）記事だけ。要約の対象になる記事に
 * 書くと、要約の一時的な失敗の1回目が2回目と扱われ、再試行されずに QUALITY_FAILED になる
 * （summary-orchestrator.ts は summaryError が NULL かで1回目を見分ける）。
 * 読んだ後に別の処理が本文を書いていたら書かない（本文の長さと更新時刻で比べる。summary-reset.ts の
 * contentStateWhere。同じ長さの本文への差し替えも拾う）。
 * DB の失敗は収集を止めないよう、ログに出して握りつぶす。
 */
export async function reportEnrichmentFailure({
  article,
  remainingContent,
  failure,
  enricherName,
  sourceId,
  sourceName,
  phase,
}: ReportEnrichmentFailureParams): Promise<void> {
  // 動画は本文を取る手段が無い（YouTubeEnricher はサムネイルだけ）ので失敗ではない。VIDEO の印が付く
  if (isYouTubeVideoUrl(article.url)) return;

  logger.warn(
    {
      url: article.url,
      sourceId,
      sourceName,
      enricher: enricherName,
      phase,
      errorCode: failure.errorCode,
      status: failure.status,
      detail: failure.detail,
      errorName: failure.errorName,
    },
    '[Enrichment] failed'
  );
  console.error(
    `   [WARN] エンリッチメント失敗: ${formatEnrichmentFailure(failure, enricherName)}`
  );

  if (validateArticleContent({ content: remainingContent ?? null }).valid) return;

  const summaryError = formatEnrichmentFailure(failure, enricherName);
  try {
    await prisma.article.updateMany({
      where: {
        id: article.id,
        AND: [
          { OR: [{ summary: null }, { summary: '' }] },
          contentStateWhere(article),
          // 自己修復は毎時同じ記事を取り直すので、同じ理由なら書き直さない（updatedAt を進めない）。
          // `not` だけでは NULL の行が外れるので、NULL も明示する
          { OR: [{ summaryError: null }, { summaryError: { not: summaryError } }] },
        ],
      },
      data: { summaryError },
    });
  } catch (dbError) {
    logger.warn(
      { articleId: article.id, err: dbError },
      '[Enrichment] failed to record the failure reason'
    );
  }
}

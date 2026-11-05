/**
 * 毎時の収集（collect-feeds.ts）で、記事ページから本文を取れなかった理由をまとめ、ログと DB に残す。
 *
 * enricher は失敗しても null を返すだけなので、理由が残らないと、取得失敗（CONTENT_FETCH_FAILED）の
 * 記事がボット対策で止められたのか、一時的な失敗なのか、ページから本文を抜き出せなかったのかを
 * 区別できない。取得の共通処理が覚えた最後の結果（lib/utils/url/fetch-trace.ts）から理由を決める。
 */
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import type { EnrichmentResult, IContentEnricher } from '@/lib/enrichers';
import { classifyEnrichmentError } from '@/lib/enrichers/error-classifier';
import { logger } from '@/lib/logger';
import { validateArticleContent } from '@/lib/summary/summary-orchestrator';
import { traceFetches, type FetchOutcome } from '@/lib/utils/url/fetch-trace';
import { isYouTubeVideoUrl } from '@/lib/utils/url/youtube';
import { runWithTimeout } from './run-with-timeout';

/** enricher を1回呼んだ結果。enricher の例外はここで受け止める */
export interface EnrichmentAttempt {
  /** enricher の戻り値。例外のときは null */
  data: EnrichmentResult | null;
  /** enricher が投げた例外（時間切れを含む） */
  error?: unknown;
  /** enricher の中で行った最後の取得の結果 */
  lastFetch?: FetchOutcome;
}

/** 本文を取れなかった理由 */
export interface EnrichmentFailure {
  /**
   * HTTP_<status>（エラーの応答）・NO_CONTENT（応答は得たが本文を抜き出せない）・THIN（本文が短い）・
   * TOO_LARGE・SSRF_REJECTED・REDIRECT_REJECTED・TIMEOUT・NETWORK・ABORTED・EXCEPTION・
   * NO_DATA（enricher が取得をせずに何も返さない）
   */
  errorCode: string;
  status?: number;
  /** 補足。challenge（ボット対策の確認ページ）・ENOTFOUND などの原因のコード・本文の文字数 */
  detail?: string;
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
  if (status >= 200 && status < 300) {
    return { errorCode: 'NO_CONTENT', status };
  }
  return {
    errorCode: `HTTP_${status}`,
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
  if (attempt.error !== undefined) {
    const classified = classifyEnrichmentError(attempt.error);
    // 取得の失敗が enricher の例外になったとき（HTTP のステータスも時間切れも読めない）は、
    // 取得の結果の方が詳しい
    if (classified.errorCode === 'EXCEPTION' && attempt.lastFetch) {
      return failureFromFetch(attempt.lastFetch);
    }
    return {
      errorCode: classified.errorCode,
      ...(classified.status !== undefined && { status: classified.status }),
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
  return `本文の取得に失敗: ${failure.errorCode}${detail} [${enricherName}]`;
}

interface ReportEnrichmentFailureParams {
  article: { id: string; url: string; contentLength: number | null };
  /** 失敗した後に残る本文（フィードの本文など）。要約に足りるなら DB には書かない */
  remainingContent: string | null | undefined;
  failure: EnrichmentFailure;
  enricherName: string;
  sourceId: string;
  sourceName: string;
  /** post-save（新しい記事）か self-heal（本文の無い既存記事の取り直し） */
  phase: 'post-save' | 'self-heal';
}

function contentLengthWhere(contentLength: number | null): Prisma.ArticleWhereInput {
  return contentLength === null || contentLength === 0
    ? { OR: [{ contentLength: null }, { contentLength: 0 }] }
    : { contentLength };
}

/**
 * 本文を取れなかった理由をログに出し、要約を作れない記事なら summaryError に書く。
 *
 * 書くのは、残る本文が要約に足りない（取得失敗・本文不足の印が付く）記事だけ。要約の対象になる記事に
 * 書くと、要約の一時的な失敗の1回目が2回目と扱われ、再試行されずに QUALITY_FAILED になる
 * （summary-orchestrator.ts は summaryError が NULL かで1回目を見分ける）。
 * 読んだ後に別の処理が本文を書いていたら書かない（本文の長さで比べる。pending-articles.ts と同じ）。
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
    },
    '[Enrichment] failed'
  );
  console.error(
    `   [WARN] エンリッチメント失敗: ${formatEnrichmentFailure(failure, enricherName)}`
  );

  if (validateArticleContent({ content: remainingContent ?? null }).valid) return;

  try {
    await prisma.article.updateMany({
      where: {
        id: article.id,
        AND: [
          { OR: [{ summary: null }, { summary: '' }] },
          contentLengthWhere(article.contentLength),
        ],
      },
      data: { summaryError: formatEnrichmentFailure(failure, enricherName) },
    });
  } catch (dbError) {
    logger.warn(
      { articleId: article.id, err: dbError },
      '[Enrichment] failed to record the failure reason'
    );
  }
}

import { TrendPeriodType, type TrendReport } from '@/lib/prisma-exports';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import { parseTrendAiSummary } from '@/lib/types/trend-ai-summary';
import { getJSTToday } from '@/lib/utils/date';
import { JST_OFFSET_MS } from './types';

/** ホームに出す注目トピックの件数 */
export const HOME_DIGEST_TOPIC_LIMIT = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface HomeDigestTopic {
  topic: string;
  whyItMatters: string;
}

export interface HomeDigestSummary {
  core: string;
  keyTopics: HomeDigestTopic[];
}

/**
 * 要点を出せない理由
 * - missing: AI の要約が無い（生成に失敗した、または対象の記事が無かった）
 * - unsupported: 要約はあるが、構造化されていない旧形式のテキスト（構造化の生成に失敗したときの代替）
 */
export type HomeDigestSummaryIssue = 'missing' | 'unsupported';

/**
 * - latest: 前日分のレポート
 * - pending: 前日分がまだ無く、前々日分を出している。前日分は当日の夜に作られる（GitHub Actions の
 *   schedule は 14:30 JST 指定だが、実際の開始は 18〜21 時ごろ）ため、それまでは通常こうなる
 * - stale: 前々日より古いレポートしか無い（生成が止まっている）
 */
export type HomeDigestFreshness = 'latest' | 'pending' | 'stale';

export type HomeDailyDigest =
  | {
      status: 'ready';
      freshness: HomeDigestFreshness;
      /** レポートの対象日（JST, YYYY-MM-DD） */
      reportDate: string;
      /** 前日（JST, YYYY-MM-DD）。本来出したいレポートの対象日 */
      expectedDate: string;
      /** レポートを集計した時刻（ISO） */
      generatedAt: string;
      /** AI の要点。出せないときは null で、理由は summaryIssue */
      summary: HomeDigestSummary | null;
      summaryIssue: HomeDigestSummaryIssue | null;
    }
  | { status: 'none' }
  | { status: 'error' };

export type DailyReportRow = Pick<
  TrendReport,
  'periodStart' | 'generatedAt' | 'createdAt' | 'aiSummary'
>;

/** UTC の Date を JST の日付文字列（YYYY-MM-DD）にする */
function toJSTDateString(date: Date): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function toSummary(aiSummary: string | null): HomeDigestSummary | null {
  const parsed = parseTrendAiSummary(aiSummary);
  if (!parsed) return null;

  if (parsed.version === 'trend_ai_summary_v2') {
    return {
      core: parsed.core,
      keyTopics: parsed.keyTopics
        .slice(0, HOME_DIGEST_TOPIC_LIMIT)
        .map(({ topic, whyItMatters }) => ({ topic, whyItMatters })),
    };
  }

  // 旧形式（v1）は headline・reason が同じ役割を持つ
  return {
    core: parsed.headline,
    keyTopics: parsed.keyTopics
      .slice(0, HOME_DIGEST_TOPIC_LIMIT)
      .map(({ topic, reason }) => ({ topic, whyItMatters: reason })),
  };
}

/** 最新のデイリーレポートと現在時刻から、ホームに出す内容を決める */
export function buildHomeDailyDigest(
  report: DailyReportRow | null,
  now: Date
): HomeDailyDigest {
  if (!report) return { status: 'none' };

  const expectedDate = toJSTDateString(new Date(now.getTime() - DAY_MS));
  const dayBeforeExpected = toJSTDateString(
    new Date(now.getTime() - 2 * DAY_MS)
  );
  const reportDate = toJSTDateString(report.periodStart);

  const freshness: HomeDigestFreshness =
    reportDate >= expectedDate
      ? 'latest'
      : reportDate === dayBeforeExpected
        ? 'pending'
        : 'stale';

  const summary = toSummary(report.aiSummary);

  return {
    status: 'ready',
    freshness,
    reportDate,
    expectedDate,
    generatedAt: (report.generatedAt ?? report.createdAt).toISOString(),
    summary,
    summaryIssue: summary
      ? null
      : report.aiSummary?.trim()
        ? 'unsupported'
        : 'missing',
  };
}

/**
 * ホームの「今日の要点」（issue #721）。最新のデイリーレポートの core・keyTopics を使い、
 * ホーム用に AI 生成は増やさない。失敗しても投げずに status: 'error' を返す（ホームの描画を止めないため）
 */
export async function getHomeDailyDigest(
  now: Date = new Date()
): Promise<HomeDailyDigest> {
  try {
    // 前日より新しい（当日の途中で手動生成した・未来日の）レポートは出さない。
    // リンク先のデイリーレポートも前日分を優先して出すため
    const yesterdayStart = new Date(getJSTToday(now).getTime() - DAY_MS);
    const report = await prisma.trendReport.findFirst({
      where: {
        periodType: TrendPeriodType.DAILY,
        periodStart: { lte: yesterdayStart },
      },
      orderBy: { periodStart: 'desc' },
      select: {
        periodStart: true,
        generatedAt: true,
        createdAt: true,
        aiSummary: true,
      },
    });
    return buildHomeDailyDigest(report, now);
  } catch (error) {
    logger.error({ err: error }, 'Failed to load daily digest for home');
    return { status: 'error' };
  }
}

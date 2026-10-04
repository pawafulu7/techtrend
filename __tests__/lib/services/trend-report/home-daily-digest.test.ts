import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@/lib/prisma-exports';
import { mockReset, type DeepMockProxy } from 'jest-mock-extended';
// jest.config.node.js の moduleNameMapper で共通のモック（mockDeep）に置き換わる
import { prisma } from '@/lib/prisma';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  buildHomeDailyDigest,
  getHomeDailyDigest,
  type DailyReportRow,
} from '@/lib/services/trend-report/home-daily-digest';

/** JST の日付 YYYY-MM-DD の 00:00 を UTC の Date にする（periodStart の保存形式） */
function jstMidnight(date: string): Date {
  return new Date(`${date}T00:00:00+09:00`);
}

const V2_SUMMARY = JSON.stringify({
  version: 'trend_ai_summary_v2',
  core: 'AIエージェントの実行基盤が技術的焦点となっている。',
  keyTopics: [1, 2, 3, 4].map((n) => ({
    topic: `トピック${n}`,
    whatHappened: `起きたこと${n}`,
    whyItMatters: `重要な理由${n}`,
    evidenceArticleIds: [`a${n}`],
  })),
  actions: [{ action: '試す', reason: '理由', articleIds: ['a1'] }],
});

function row(overrides: Partial<DailyReportRow> = {}): DailyReportRow {
  return {
    periodStart: jstMidnight('2026-10-04'),
    generatedAt: new Date('2026-10-05T05:35:00Z'),
    createdAt: new Date('2026-10-05T05:35:01Z'),
    aiSummary: V2_SUMMARY,
    ...overrides,
  };
}

// 2026-10-05 15:00 JST
const NOW = new Date('2026-10-05T06:00:00Z');

describe('buildHomeDailyDigest（issue #721）', () => {
  it('前日分のレポートは latest で、core と注目トピック3件を出す', () => {
    const digest = buildHomeDailyDigest(row(), NOW);
    expect(digest).toEqual({
      status: 'ready',
      freshness: 'latest',
      reportDate: '2026-10-04',
      expectedDate: '2026-10-04',
      generatedAt: '2026-10-05T05:35:00.000Z',
      summary: {
        core: 'AIエージェントの実行基盤が技術的焦点となっている。',
        keyTopics: [1, 2, 3].map((n) => ({
          topic: `トピック${n}`,
          whyItMatters: `重要な理由${n}`,
        })),
      },
      summaryIssue: null,
    });
  });

  it('前日分がまだ無く前々日分しか無ければ pending', () => {
    const digest = buildHomeDailyDigest(
      row({ periodStart: jstMidnight('2026-10-03') }),
      NOW
    );
    expect(digest).toMatchObject({
      status: 'ready',
      freshness: 'pending',
      reportDate: '2026-10-03',
      expectedDate: '2026-10-04',
    });
  });

  it('前々日より古いレポートしか無ければ stale', () => {
    const digest = buildHomeDailyDigest(
      row({ periodStart: jstMidnight('2026-09-29') }),
      NOW
    );
    expect(digest).toMatchObject({
      freshness: 'stale',
      reportDate: '2026-09-29',
    });
  });

  it('日付は JST で数える（JST 0時台は UTC では前日）', () => {
    // 2026-10-05 00:30 JST = 2026-10-04 15:30 UTC。前日は 10-04
    const justAfterMidnight = new Date('2026-10-04T15:30:00Z');
    expect(buildHomeDailyDigest(row(), justAfterMidnight)).toMatchObject({
      freshness: 'latest',
      expectedDate: '2026-10-04',
    });
    // 2026-10-04 23:30 JST。前日は 10-03
    const justBeforeMidnight = new Date('2026-10-04T14:30:00Z');
    expect(
      buildHomeDailyDigest(
        row({ periodStart: jstMidnight('2026-10-03') }),
        justBeforeMidnight
      )
    ).toMatchObject({ freshness: 'latest', expectedDate: '2026-10-03' });
  });

  it.each([
    ['AI 要約が無い', null],
    ['AI 要約が空', '  '],
  ])(
    '%s レポートは summary: null・missing（生成失敗）',
    (_label, aiSummary) => {
      const digest = buildHomeDailyDigest(
        row({ aiSummary, generatedAt: null }),
        NOW
      );
      expect(digest).toMatchObject({
        status: 'ready',
        summary: null,
        summaryIssue: 'missing',
        // AI の生成時刻が無いときは、レポートを保存した時刻を出す
        generatedAt: '2026-10-05T05:35:01.000Z',
      });
    }
  );

  it.each([
    [
      '旧形式のテキスト（構造化の生成に失敗したときの代替）',
      '[注目トピック]\n(1) AI: 理由\n\n[アクションポイント]\n読む',
    ],
    ['形式が合わない JSON', JSON.stringify({ version: 'trend_ai_summary_v2' })],
  ])(
    '%s は summary: null・unsupported（生成失敗と区別する）',
    (_label, aiSummary) => {
      expect(buildHomeDailyDigest(row({ aiSummary }), NOW)).toMatchObject({
        status: 'ready',
        summary: null,
        summaryIssue: 'unsupported',
      });
    }
  );

  it('旧形式（v1）は headline・reason を core・whyItMatters に当てる', () => {
    const v1 = JSON.stringify({
      version: 'trend_ai_summary_v1',
      headline: '見出し',
      keyTopics: [{ topic: 'T', reason: '理由' }],
      actions: [{ title: 'A', detail: 'D' }],
    });
    expect(buildHomeDailyDigest(row({ aiSummary: v1 }), NOW)).toMatchObject({
      summary: {
        core: '見出し',
        keyTopics: [{ topic: 'T', whyItMatters: '理由' }],
      },
    });
  });

  it('レポートが1件も無ければ none', () => {
    expect(buildHomeDailyDigest(null, NOW)).toEqual({ status: 'none' });
  });
});

describe('getHomeDailyDigest', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  it('前日以前で最新のデイリーレポートを1件、必要な列だけ引く', async () => {
    prismaMock.trendReport.findFirst.mockResolvedValue(
      row() as Awaited<ReturnType<typeof prisma.trendReport.findFirst>>
    );
    const digest = await getHomeDailyDigest(NOW);
    expect(digest).toMatchObject({ status: 'ready', freshness: 'latest' });
    expect(prismaMock.trendReport.findFirst).toHaveBeenCalledWith({
      // 当日の途中で手動生成した・未来日のレポートは除く（前日 10-04 の JST 0時まで）
      where: {
        periodType: 'DAILY',
        periodStart: { lte: jstMidnight('2026-10-04') },
      },
      orderBy: { periodStart: 'desc' },
      select: {
        periodStart: true,
        generatedAt: true,
        createdAt: true,
        aiSummary: true,
      },
    });
  });

  it('DB の失敗は投げずに error を返す（ホームの描画を止めない）', async () => {
    prismaMock.trendReport.findFirst.mockRejectedValue(new Error('db down'));
    await expect(getHomeDailyDigest(NOW)).resolves.toEqual({ status: 'error' });
  });
});

/**
 * 定期採点（manage-quality-scores calculate）の --dry-run が DB を更新しないことを検証する（issue #655）
 */

const mockCalculateArticleQualityScore = jest.fn();
const mockGetLastProcessedTime = jest.fn();
const mockSaveProcessingStatus = jest.fn();

jest.mock('@/lib/utils/quality-score', () => ({
  calculateArticleQualityScore: (...args: unknown[]) =>
    mockCalculateArticleQualityScore(...args),
}));

jest.mock('@/scripts/utils/processing-status', () => ({
  getLastProcessedTime: (...args: unknown[]) => mockGetLastProcessedTime(...args),
  saveProcessingStatus: (...args: unknown[]) => mockSaveProcessingStatus(...args),
}));

import { prisma } from '@/lib/prisma';
import {
  calculateAllQualityScores,
  recalculateScores,
} from '@/scripts/scheduled/manage-quality-scores';

// @/lib/prisma は jest.config の moduleNameMapper で共有の prismaMock に置き換わる
const mockPrisma = prisma as unknown as {
  article: { findMany: jest.Mock; updateMany: jest.Mock };
  $executeRaw: jest.Mock;
  $queryRaw: jest.Mock;
};

const computedAt = new Date('2026-09-01T00:00:00Z');
const articles = [
  // スコアが変わる記事
  { id: 'a1', title: 'Raised', qualityScore: 60, qualityScoreComputedAt: computedAt },
  // スコアが変わらない採点済みの記事（更新しない）
  { id: 'a2', title: 'Same', qualityScore: 70, qualityScoreComputedAt: computedAt },
  // 未採点の記事（値が同じでも採点日時を付けるために更新する）
  { id: 'a3', title: 'Unscored', qualityScore: 50, qualityScoreComputedAt: null },
];
const newScores: Record<string, number> = { a1: 75, a2: 70, a3: 50 };

describe('manage-quality-scores calculate', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetLastProcessedTime.mockResolvedValue(null);
    mockCalculateArticleQualityScore.mockImplementation(
      (article: { id: string }) => newScores[article.id]
    );
    mockPrisma.article.findMany.mockResolvedValueOnce(articles).mockResolvedValueOnce([]);
    mockPrisma.$executeRaw.mockResolvedValue(2);
    mockPrisma.$queryRaw.mockResolvedValue([]);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('--dry-run では更新も処理状態の保存もせず、変わる件数を表示する', async () => {
    await calculateAllQualityScores({ command: 'calculate', dryRun: true });

    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    // 保存すると次回の差分処理で対象から外れる
    expect(mockSaveProcessingStatus).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();

    const output = consoleErrorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain(
      '更新される記事: 2件（上がる 1件 / 下がる 0件 / 値は同じで採点日時だけ付く 1件）'
    );
    expect(output).toContain('Raised... 60 -> 75');
  });

  it('--dry-run なしでは変わる記事を更新し、処理状態を保存する', async () => {
    await calculateAllQualityScores({ command: 'calculate' });

    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    // VALUES に入るのは a1 と a3 だけ
    const sqlValues = mockPrisma.$executeRaw.mock.calls[0].slice(1).flatMap(
      (value: { values?: unknown[] }) => value?.values ?? []
    );
    const flattened = JSON.stringify(sqlValues);
    expect(flattened).toContain('a1');
    expect(flattened).toContain('a3');
    expect(flattened).not.toContain('a2');
    expect(mockSaveProcessingStatus).toHaveBeenCalledTimes(1);
  });

  it('recalculate --force --dry-run は全記事を 0 点にリセットしない', async () => {
    await recalculateScores({ command: 'recalculate', force: true, dryRun: true });

    // リセットすると全記事が今の新鮮さで採点し直され、古い記事が一斉に下がる
    expect(mockPrisma.article.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    expect(mockSaveProcessingStatus).not.toHaveBeenCalled();
  });
});

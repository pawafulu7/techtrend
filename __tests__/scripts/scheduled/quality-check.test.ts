/**
 * 定期の品質チェック（scripts/scheduled/quality-check.ts）が、要約生成と同じ判定で採点し、
 * DB に作り直しの印を書かないことを検証する（issue #833）
 */
import { prisma } from '@/lib/prisma';
import { resetEnvCache } from '@/lib/config/env';
import { checkQuality } from '@/scripts/scheduled/quality-check';

// @/lib/prisma は jest.config の moduleNameMapper で共有の prismaMock に置き換わる
const mockPrisma = prisma as unknown as {
  article: { findMany: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
};

const SUMMARY_45 = 'あ'.repeat(44) + '。';
const DETAILED = '・' + 'い'.repeat(40) + '。\n・' + 'う'.repeat(40) + '。';

function article(id: string, contentLength: number) {
  return {
    id,
    title: `タイトル ${id}`,
    summary: SUMMARY_45,
    detailedSummary: DETAILED,
    contentLength,
  };
}

describe('checkQuality', () => {
  const originalEnv = process.env;
  let output: string;

  beforeEach(() => {
    process.env = { ...originalEnv, QUALITY_MIN_SCORE: '70' };
    resetEnvCache();
    mockPrisma.article.findMany.mockReset();
    mockPrisma.article.update.mockReset();
    mockPrisma.article.updateMany.mockReset();
    output = '';
    jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      output += args.join(' ') + '\n';
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
    resetEnvCache();
  });

  it('短い記事の40字台の要約は、生成時の合格点に届くので低品質に数えない', async () => {
    // 生成時の判定は本文が 400 字未満なら一覧要約の下限を 40 字にする。
    // 旧採点は一律に 50 字未満を「短すぎる」として作り直しの印を付けていた
    mockPrisma.article.findMany.mockResolvedValue([
      article('thin', 300),
      article('normal', 3000),
    ]);

    await checkQuality({ days: 7 });

    expect(output).toContain('生成時の合格点（70点）未満の記事: 1件');
    expect(output).toContain('ID: normal');
    expect(output).not.toContain('ID: thin');
  });

  it('DB に作り直しの印を書かない', async () => {
    mockPrisma.article.findMany.mockResolvedValue([article('normal', 3000)]);

    await checkQuality({ days: 7 });

    expect(mockPrisma.article.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.article.update).not.toHaveBeenCalled();
  });

  it('問題は数値を除いた種類ごとに数える', async () => {
    mockPrisma.article.findMany.mockResolvedValue([
      article('a', 3000),
      article('b', 3000),
    ]);

    await checkQuality({ days: 7 });

    expect(output).toContain('  - 一覧要約が短すぎる: 2件');
  });
});

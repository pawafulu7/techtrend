/**
 * 定期の品質チェック（scripts/scheduled/quality-check.ts）が、要約生成と同じ判定で採点し、
 * DB に作り直しの印を書かないことを検証する（issue #833）
 */
import { prisma } from '@/lib/prisma';
import { checkQuality } from '@/scripts/scheduled/quality-check';

// @/lib/prisma は jest.config の moduleNameMapper で共有の prismaMock に置き換わる
const mockPrisma = prisma as unknown as {
  article: { findMany: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
};

const SUMMARY_45 = 'あ'.repeat(44) + '。';
const SUMMARY_150 = 'い'.repeat(149) + '。';
const BULLETS_2 = '・' + 'う'.repeat(40) + '。\n・' + 'え'.repeat(40) + '。';
const BULLETS_5 = Array.from({ length: 5 }, (_, i) => `・項目${i}：` + 'お'.repeat(60) + '。').join('\n');

function article(
  id: string,
  content: string | null,
  summary = SUMMARY_45,
  detailedSummary = ''
) {
  // contentLength は DB トリガーと同じくコードポイント数（CHAR_LENGTH）にする
  const contentLength = content === null ? null : [...content].length;
  return { id, title: `タイトル ${id}`, summary, detailedSummary, content, contentLength };
}

describe('checkQuality', () => {
  let output: string;

  beforeEach(() => {
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
  });

  it('短い記事の40字台の要約は、生成時の判定で通るので低品質に数えない', async () => {
    // 生成時の判定は本文が 400 字未満なら一覧要約の下限を 40 字にする。
    // 旧採点は一律に 50 字未満を「短すぎる」として作り直しの印を付けていた
    mockPrisma.article.findMany.mockResolvedValue([
      article('thin', 'あ'.repeat(300)),
      article('normal', 'あ'.repeat(3000)),
    ]);

    await checkQuality({ days: 7 });

    expect(output).toContain('低品質記事（70点未満）: 1件');
    expect(output).toContain('ID: normal');
    expect(output).not.toContain('ID: thin');
  });

  it('DB に作り直しの印を書かない', async () => {
    mockPrisma.article.findMany.mockResolvedValue([article('normal', 'あ'.repeat(3000))]);

    await checkQuality({ days: 7 });

    expect(mockPrisma.article.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.article.update).not.toHaveBeenCalled();
  });

  it('本文の長さは生成時と同じく content.length で数える', async () => {
    // JavaScript の length は 400（短い記事ではない）、DB の CHAR_LENGTH は 399（短い記事）。
    // 短い記事として採点すると、150 字の一覧要約が上限（100 字）を超える
    mockPrisma.article.findMany.mockResolvedValue([
      article('emoji', 'あ'.repeat(398) + '😀', SUMMARY_150, BULLETS_5),
    ]);

    await checkQuality({ days: 7 });

    expect(output).not.toContain('一覧要約が長すぎる');
  });

  it('本文の無い記事は短い記事として採点しない', async () => {
    mockPrisma.article.findMany.mockResolvedValue([
      article('no-content', null, SUMMARY_150, BULLETS_5),
    ]);

    await checkQuality({ days: 7 });

    expect(output).not.toContain('一覧要約が長すぎる');
  });

  it('問題は数値を除いた種類ごとに数える', async () => {
    mockPrisma.article.findMany.mockResolvedValue([
      article('a', 'あ'.repeat(300), SUMMARY_45, BULLETS_2),
      article('b', 'あ'.repeat(301), SUMMARY_45, BULLETS_2),
    ]);

    await checkQuality({ days: 7 });

    expect(output).toContain('  - 短文（N字）に箇条書き（N項目）は不適切。平文N-N文で要約すべき: 2件');
  });
});

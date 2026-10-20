/**
 * 毎時の収集で、既存記事を出し手のソースへ付け替える処理（scripts/scheduled/utils/source-transfer.ts）
 *
 * 付け替えるかの判定は lib/fetchers/source-transfer.ts（__tests__/fetchers/newsletter-sources.test.ts）。
 * ここでは、読んだ時点の sourceId のままのときだけ書き換えることと、品質スコアを採点し直す対象に
 * 戻すことを確かめる。
 */
import { prisma } from '@/lib/prisma';
import { transferSourceIfNeeded } from '@/scripts/scheduled/utils/source-transfer';

// @/lib/prisma は jest.config の moduleNameMapper で共有の prismaMock に置き換わる
const mockUpdateMany = (prisma as unknown as { article: { updateMany: jest.Mock } }).article
  .updateMany;

const publisher = 'github_blog_202508';

describe('transferSourceIfNeeded', () => {
  beforeEach(() => {
    mockUpdateMany.mockReset();
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('リンクを集めるソースの記事を出し手へ付け替え、品質スコアを採点し直す対象に戻す', async () => {
    await expect(
      transferSourceIfNeeded({ id: 'a1', sourceId: 'hacker_news_202508' }, publisher)
    ).resolves.toBe(true);

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'a1', sourceId: 'hacker_news_202508' },
      data: { sourceId: publisher, qualityScoreComputedAt: null },
    });
  });

  it('読んだ後に別のソースが付け替えていたら（更新が0件なら）、付け替えたことにしない', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      transferSourceIfNeeded({ id: 'a1', sourceId: 'hacker_news_202508' }, publisher)
    ).resolves.toBe(false);
  });

  it('付け替えが要らない記事は書き換えない', async () => {
    await expect(
      transferSourceIfNeeded({ id: 'a1', sourceId: 'cloudflare_blog_202508' }, publisher)
    ).resolves.toBe(false);

    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

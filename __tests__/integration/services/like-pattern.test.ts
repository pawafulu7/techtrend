/**
 * escapeLikePattern の結合テスト（実 DB、#684）
 *
 * Prisma の contains・equals（mode: 'insensitive'）は値をエスケープせずに ILIKE を組み立てる。
 * その挙動と、escapeLikePattern で `_`・`%`・`\` が文字どおりに照合されることを実 DB で固定する。
 * Prisma が将来エスケープを始めると「エスケープしない場合」のテストが落ちるので、
 * 二重エスケープに気づける（Prisma を上げる PR ではこのテストを走らせる）。
 * 実行: npm run test:integration:docker
 */
import { prisma } from '@/lib/prisma';
import { escapeLikePattern } from '@/lib/utils/like-pattern';

// 他のデータと衝突しないよう、固有の接頭辞を付ける（ワイルドカード文字を含まない）
const P = `it684x${Date.now()}`;

async function namesContaining(value: string) {
  const tags = await prisma.tag.findMany({
    where: { name: { contains: value, mode: 'insensitive' } },
    select: { name: true },
    orderBy: { name: 'asc' },
  });
  return tags.map((t) => t.name);
}

describe('escapeLikePattern (integration, #684)', () => {
  beforeAll(async () => {
    await prisma.tag.createMany({
      data: ['a_b', 'axb', '100%', '1000', 'c\\d', 'cxd'].map((suffix, i) => ({
        id: `${P}-${i}`,
        name: `${P}${suffix}`,
      })),
    });
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM "Tag" WHERE id LIKE ${`${P}-%`}`;
    await prisma.$disconnect();
  });

  it('Prisma の contains はエスケープしないので、_ が任意の 1 文字に当たる', async () => {
    expect(await namesContaining(`${P}a_b`)).toEqual([`${P}a_b`, `${P}axb`]);
  });

  it('エスケープすると _ は文字どおりに照合される', async () => {
    expect(await namesContaining(escapeLikePattern(`${P}a_b`))).toEqual([
      `${P}a_b`,
    ]);
  });

  it('エスケープすると % は文字どおりに照合される', async () => {
    expect(await namesContaining(escapeLikePattern(`${P}100%`))).toEqual([
      `${P}100%`,
    ]);
  });

  it('エスケープすると \\ は文字どおりに照合される', async () => {
    expect(await namesContaining(escapeLikePattern(`${P}c\\d`))).toEqual([
      `${P}c\\d`,
    ]);
  });

  it('equals + insensitive もエスケープしないので、_ が任意の 1 文字に当たる', async () => {
    const tags = await prisma.tag.findMany({
      where: { name: { equals: `${P}A_B`, mode: 'insensitive' } },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    expect(tags.map((t) => t.name)).toEqual([`${P}a_b`, `${P}axb`]);
  });

  it('in + insensitive は lower() の比較で、_ を文字どおりに扱う（ソースプリセットの重複判定）', async () => {
    const tags = await prisma.tag.findMany({
      where: { name: { in: [`${P}A_B`], mode: 'insensitive' } },
      select: { name: true },
    });
    expect(tags.map((t) => t.name)).toEqual([`${P}a_b`]);
  });
});

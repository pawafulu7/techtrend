/**
 * タグと興味の分野の対応付け（lib/personalization/tag-category-mapping.ts）
 */
import {
  buildNormalizedPatternMap,
  matchCategorySlugs,
  syncTagCategoryMappings,
} from '@/lib/personalization/tag-category-mapping';

describe('matchCategorySlugs', () => {
  const patternMap = buildNormalizedPatternMap();

  it.each([
    ['Next.js', ['frontend']],
    // TagNormalizer で Next.js に正規化してから引く
    ['nextjs', ['frontend']],
    // TagNormalizer で AIエージェント に正規化される
    ['AI Agent', ['ai-ml']],
    ['MCP', ['ai-ml']],
    ['CloudNative', ['cloud']],
    ['Web Development', ['frontend']],
    ['セキュリティ', ['security']],
    // 2 つの分野のパターンにある
    ['DynamoDB', ['cloud', 'database']],
  ])('%s は %j に対応付ける', (tagName, expected) => {
    expect(matchCategorySlugs(tagName, patternMap).sort()).toEqual(
      [...expected].sort()
    );
  });

  it.each(['Tech', 'Programming', 'Techmeme', 'Open Source'])(
    '意味の広いタグ・パターンに無いタグ（%s）は対応付けない',
    (tagName) => {
      expect(matchCategorySlugs(tagName, patternMap)).toEqual([]);
    }
  );
});

describe('syncTagCategoryMappings', () => {
  const createDb = (
    tags: { id: string; name: string }[],
    existing: { id: string; tagId: string; categoryId: string }[] = []
  ) => {
    const db = {
      interestCategory: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'cat-frontend', slug: 'frontend' },
          { id: 'cat-ai', slug: 'ai-ml' },
        ]),
      },
      tag: { findMany: jest.fn().mockResolvedValue(tags) },
      tagCategoryMapping: {
        findMany: jest.fn().mockResolvedValue(existing),
        createMany: jest.fn(
          async ({ data }: { data: unknown[] }) => ({ count: data.length })
        ),
        deleteMany: jest.fn(
          async ({ where }: { where: { id: { in: string[] } } }) => ({
            count: where.id.in.length,
          })
        ),
      },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations)
      ),
    };
    return db;
  };

  it('パターンに合うのに無い組を足し、合わなくなった組を消す（DB に分野が無いものは足さない）', async () => {
    const db = createDb(
      [
        { id: 'tag-react', name: 'React' },
        { id: 'tag-agent', name: 'AI Agent' },
        // DB に分野が無い（cloud）
        { id: 'tag-docker', name: 'Docker' },
        { id: 'tag-tech', name: 'Tech' },
      ],
      [
        // そのまま残る
        { id: 'm-react', tagId: 'tag-react', categoryId: 'cat-frontend' },
        // パターンに合わない（Tech は意味の広いタグ）
        { id: 'm-tech', tagId: 'tag-tech', categoryId: 'cat-ai' },
        // 分野が違う
        { id: 'm-agent-frontend', tagId: 'tag-agent', categoryId: 'cat-frontend' },
      ]
    );

    const result = await syncTagCategoryMappings(db as never);

    expect(result).toEqual({ created: 1, deleted: 2 });
    expect(db.tagCategoryMapping.createMany).toHaveBeenCalledWith({
      data: [{ tagId: 'tag-agent', categoryId: 'cat-ai' }],
      skipDuplicates: true,
    });
    expect(db.tagCategoryMapping.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['m-tech', 'm-agent-frontend'] } },
    });
  });

  it('対応付けがパターンどおりなら書かない', async () => {
    const db = createDb(
      [
        { id: 'tag-react', name: 'React' },
        { id: 'tag-tech', name: 'Tech' },
      ],
      [{ id: 'm-react', tagId: 'tag-react', categoryId: 'cat-frontend' }]
    );

    expect(await syncTagCategoryMappings(db as never)).toEqual({
      created: 0,
      deleted: 0,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

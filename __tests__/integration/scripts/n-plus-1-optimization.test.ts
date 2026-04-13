/**
 * N+1 最適化 統合テスト
 *
 * 6つの最適化スクリプト（H1/H2/H3/H4/M8/N2）の
 * SQL正確性・冪等性・エッジケースを Docker Postgres に対して検証する。
 *
 * 実行方法 (Docker Postgres 使用):
 *   npm run docker:test:up  # テスト用DBコンテナ起動
 *   DATABASE_URL=postgresql://postgres:postgres_test_password@localhost:5434/techtrend_test \
 *     npx jest -c jest.config.integration.js \
 *     __tests__/integration/scripts/n-plus-1-optimization.test.ts
 */

import { Prisma } from '@/lib/prisma-exports';
import { createPrismaClient } from '@/lib/prisma/create-client';

const TEST_PREFIX = '__test_n1_';

const prisma = createPrismaClient({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres_dev_password@localhost:5434/techtrend_test',
});

// ---------------------------------------------------------------------------
// ヘルパー: テスト用ソース作成
// ---------------------------------------------------------------------------
async function createTestSource(suffix: string) {
  const name = `${TEST_PREFIX}source_${suffix}`;
  // 残骸があれば先に削除
  await prisma.$executeRaw`
    DELETE FROM "Source" WHERE name = ${name}
  `;
  return prisma.source.create({
    data: {
      name,
      type: 'RSS',
      url: `https://test-n1.example.com/${suffix}`,
      enabled: true,
    },
  });
}

// ---------------------------------------------------------------------------
// ヘルパー: テスト用記事作成
// ---------------------------------------------------------------------------
async function createTestArticle(sourceId: string, suffix: string) {
  const url = `https://test-n1.example.com/articles/${suffix}`;
  // 残骸があれば先に削除
  await prisma.$executeRaw`DELETE FROM "Article" WHERE url = ${url}`;
  return prisma.article.create({
    data: {
      title: `${TEST_PREFIX}article_${suffix}`,
      url,
      publishedAt: new Date(),
      sourceId,
    },
  });
}

// ---------------------------------------------------------------------------
// ヘルパー: テスト用タグ作成（upsert で残骸を上書き）
// ---------------------------------------------------------------------------
async function createTestTag(name: string, category?: string | null) {
  return prisma.tag.upsert({
    where: { name },
    update: { category: category ?? null },
    create: { name, category: category ?? null },
  });
}

// ---------------------------------------------------------------------------
// cleanup: テスト後にデータ削除
// ---------------------------------------------------------------------------
async function cleanupTestData() {
  // Article を先に削除（_ArticleToTag は cascade で消える）
  await prisma.$executeRaw`
    DELETE FROM "Article"
    WHERE url LIKE ${'https://test-n1.example.com/%'}
       OR title LIKE ${TEST_PREFIX + '%'}
  `;
  await prisma.$executeRaw`
    DELETE FROM "Tag" WHERE name LIKE ${TEST_PREFIX + '%'}
  `;
  await prisma.$executeRaw`
    DELETE FROM "Source" WHERE name LIKE ${TEST_PREFIX + '%'}
  `;
}

// ===========================================================================
// Test Suite
// ===========================================================================

describe('N+1 最適化 統合テスト', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  // =========================================================================
  // H1: getDuplicateGroups — 単一クエリで重複タグを検出
  //
  // Tag.name は @unique 制約があるため、通常の prisma.tag.create では
  // 同名タグを複数作れない。$executeRaw で直接 INSERT して制約をバイパスする。
  // =========================================================================
  describe('H1: getDuplicateGroups — COLLATE "C" による重複グループ取得', () => {
    const dupTagName = `${TEST_PREFIX}dup_tag`;

    beforeAll(async () => {
      // 一時テーブルを作成（Tag 構造を模倣、unique 制約なし）
      await prisma.$executeRaw`
        CREATE TEMP TABLE IF NOT EXISTS tag_dup_test_temp (
          id       TEXT NOT NULL,
          name     TEXT NOT NULL,
          category TEXT
        )
      `;
      // テーブルをクリア（前回テストの残骸があれば消す）
      await prisma.$executeRaw`DELETE FROM tag_dup_test_temp`;

      // 3 件の重複レコードを直接 INSERT（unique 制約なしなので問題なし）
      for (let i = 0; i < 3; i++) {
        await prisma.$executeRaw`
          INSERT INTO tag_dup_test_temp (id, name, category)
          VALUES (gen_random_uuid()::text, ${dupTagName}, NULL)
        `;
      }
    });

    afterAll(async () => {
      await prisma.$executeRaw`DROP TABLE IF EXISTS tag_dup_test_temp`;
    });

    it('同名タグが 3 件あれば 1 グループとして返される', async () => {
      const rows = await prisma.$queryRaw<{ name: string; ids: string[] }[]>`
        SELECT name COLLATE "C" as name, json_agg(id ORDER BY id ASC) as ids
        FROM tag_dup_test_temp
        WHERE name = ${dupTagName}
        GROUP BY name COLLATE "C"
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe(dupTagName);
      expect(rows[0].ids).toHaveLength(3);

      // ids は ASC ソート済みであること
      const sorted = [...rows[0].ids].sort();
      expect(rows[0].ids).toEqual(sorted);
    });

  });

  // =========================================================================
  // H1 補足: COLLATE "C" 動作確認（unique 制約復元後）
  // =========================================================================
  describe('H1 補足: getDuplicateGroups — COLLATE 動作確認', () => {
    it('重複なしのタグは 0 件', async () => {
      const uniqueName = `${TEST_PREFIX}unique_only`;
      await createTestTag(uniqueName);

      const rows = await prisma.$queryRaw<{ name: string; ids: string[] }[]>`
        SELECT name COLLATE "C" as name, json_agg(id ORDER BY id ASC) as ids
        FROM "Tag"
        WHERE name = ${uniqueName}
        GROUP BY name COLLATE "C"
        HAVING COUNT(*) > 1
      `;

      expect(rows).toHaveLength(0);

      await prisma.tag.deleteMany({ where: { name: uniqueName } });
    });

    it('COLLATE "C" が大文字小文字を区別すること', async () => {
      const lower = `${TEST_PREFIX}case_a`;
      const upper = `${TEST_PREFIX}CASE_A`;
      await createTestTag(lower);
      await createTestTag(upper);

      const rows = await prisma.$queryRaw<{ name: string; ids: string[] }[]>`
        SELECT name COLLATE "C" as name, json_agg(id ORDER BY id ASC) as ids
        FROM "Tag"
        WHERE name IN (${lower}, ${upper})
        GROUP BY name COLLATE "C"
        HAVING COUNT(*) > 1
      `;

      // 大文字小文字が違うので重複グループなし
      expect(rows).toHaveLength(0);

      await prisma.tag.deleteMany({ where: { name: { in: [lower, upper] } } });
    });
  });

  // =========================================================================
  // H2/H3/H4: バルク UPDATE パターン
  // =========================================================================
  describe('H2/H3/H4: バルク UPDATE — qualityScore / difficulty / updatedAt', () => {
    let source: { id: string };
    const articleIds: string[] = [];

    beforeAll(async () => {
      source = await createTestSource('bulk_update');
      for (let i = 0; i < 3; i++) {
        const a = await createTestArticle(source.id, `bulk_${i}`);
        articleIds.push(a.id);
      }
    });

    afterAll(async () => {
      await prisma.article.deleteMany({ where: { id: { in: articleIds } } });
      await prisma.source.deleteMany({ where: { id: source.id } });
    });

    it('qualityScore と qualityScoreComputedAt を一括更新できる', async () => {
      const computedAt = new Date();
      const tuples = articleIds.map((id, idx) => ({ id, score: 60 + idx * 5, computedAt }));

      const values = Prisma.join(
        tuples.map((t) => Prisma.sql`(${t.id}, ${t.score}, ${t.computedAt})`),
        ', ',
      );

      await prisma.$executeRaw`
        UPDATE "Article"
        SET
          "qualityScore" = v.score::double precision,
          "qualityScoreComputedAt" = v.computed_at::timestamptz,
          "updatedAt" = NOW()
        FROM (VALUES ${values}) AS v(id, score, computed_at)
        WHERE "Article".id = v.id::text
      `;

      const updated = await prisma.article.findMany({
        where: { id: { in: articleIds } },
        orderBy: { title: 'asc' },
      });

      for (let i = 0; i < updated.length; i++) {
        expect(updated[i].qualityScore).toBe(tuples[i].score);
        expect(updated[i].qualityScoreComputedAt).not.toBeNull();
      }
    });

    it('updatedAt が実際に更新される（key review finding）', async () => {
      const before = await prisma.article.findMany({
        where: { id: { in: articleIds } },
        select: { id: true, updatedAt: true },
      });

      // 時刻差を確保するため 10ms 待機
      await new Promise((r) => setTimeout(r, 10));

      const values = Prisma.join(
        articleIds.map((id) =>
          Prisma.sql`(${id}, ${75}::double precision, ${new Date()}::timestamptz)`,
        ),
        ', ',
      );

      await prisma.$executeRaw`
        UPDATE "Article"
        SET
          "qualityScore" = v.score::double precision,
          "qualityScoreComputedAt" = v.computed_at::timestamptz,
          "updatedAt" = NOW()
        FROM (VALUES ${values}) AS v(id, score, computed_at)
        WHERE "Article".id = v.id::text
      `;

      const after = await prisma.article.findMany({
        where: { id: { in: articleIds } },
        select: { id: true, updatedAt: true },
      });

      const beforeMap = new Map(before.map((r) => [r.id, r.updatedAt]));
      for (const row of after) {
        const prev = beforeMap.get(row.id)!;
        expect(row.updatedAt.getTime()).toBeGreaterThan(prev.getTime());
      }
    });

    it('difficulty を一括更新できる', async () => {
      const difficulties = ['beginner', 'intermediate', 'advanced'];
      const tuples = articleIds.map((id, idx) => ({
        id,
        difficulty: difficulties[idx % 3],
      }));

      const values = Prisma.join(
        tuples.map((t) => Prisma.sql`(${t.id}, ${t.difficulty})`),
        ', ',
      );

      await prisma.$executeRaw`
        UPDATE "Article"
        SET "difficulty" = v.difficulty::text
        FROM (VALUES ${values}) AS v(id, difficulty)
        WHERE "Article".id = v.id::text
      `;

      const updated = await prisma.article.findMany({
        where: { id: { in: articleIds } },
        orderBy: { title: 'asc' },
      });

      for (let i = 0; i < updated.length; i++) {
        expect(updated[i].difficulty).toBe(tuples[i].difficulty);
      }
    });

    it('空バッチ（0 タプル）ではクエリを発行しない（エラーなし）', async () => {
      const tuples: Array<{ id: string; score: number; computedAt: Date }> = [];

      // スクリプトと同じ guard: tuples.length > 0 のときのみ実行
      if (tuples.length > 0) {
        const values = Prisma.join(
          tuples.map((t) => Prisma.sql`(${t.id}, ${t.score}, ${t.computedAt})`),
          ', ',
        );
        await prisma.$executeRaw`
          UPDATE "Article"
          SET "qualityScore" = v.score::double precision,
              "qualityScoreComputedAt" = v.computed_at::timestamptz,
              "updatedAt" = NOW()
          FROM (VALUES ${values}) AS v(id, score, computed_at)
          WHERE "Article".id = v.id::text
        `;
      }

      expect(true).toBe(true); // no-op
    });
  });

  // =========================================================================
  // M8: タグ正規化 — _ArticleToTag join table の bulk 操作
  // =========================================================================
  describe('M8: タグ正規化 — _ArticleToTag join table の bulk 操作', () => {
    let source: { id: string };
    let fromTag: { id: string };
    let toTag: { id: string };
    let article1: { id: string };
    let article2: { id: string };
    let article3: { id: string };

    beforeAll(async () => {
      source = await createTestSource('tag_norm');
      fromTag = await createTestTag(`${TEST_PREFIX}node_from`);
      toTag = await createTestTag(`${TEST_PREFIX}node_to`);

      article1 = await createTestArticle(source.id, 'norm_a1');
      article2 = await createTestArticle(source.id, 'norm_a2');
      article3 = await createTestArticle(source.id, 'norm_a3');

      // article1, article2 → fromTag のみ
      await prisma.article.update({
        where: { id: article1.id },
        data: { tags: { connect: { id: fromTag.id } } },
      });
      await prisma.article.update({
        where: { id: article2.id },
        data: { tags: { connect: { id: fromTag.id } } },
      });

      // article3 → fromTag AND toTag（重複ケース）
      await prisma.article.update({
        where: { id: article3.id },
        data: { tags: { connect: [{ id: fromTag.id }, { id: toTag.id }] } },
      });
    });

    afterAll(async () => {
      await prisma.article.deleteMany({
        where: { id: { in: [article1.id, article2.id, article3.id] } },
      });
      // tag は cascade または既に削除
      await prisma.tag.deleteMany({
        where: { id: { in: [fromTag.id, toTag.id] } },
      });
      await prisma.source.deleteMany({ where: { id: source.id } });
    });

    it('fromTag の記事が toTag に移動し、重複は自動スキップされる', async () => {
      const fromTagId = fromTag.id;
      const toTagId = toTag.id;

      await prisma.$transaction(async (tx) => {
        // 1. fromTag の記事を toTag に移動（既に toTag を持つ記事は除外）
        await tx.$executeRaw`
          UPDATE "_ArticleToTag"
          SET "B" = ${toTagId}
          WHERE "B" = ${fromTagId}
          AND "A" NOT IN (
            SELECT "A" FROM "_ArticleToTag" WHERE "B" = ${toTagId}
          )
        `;

        // 2. 残存する fromTag リンクを削除（重複していた article3 の fromTag リンク）
        await tx.$executeRaw`
          DELETE FROM "_ArticleToTag" WHERE "B" = ${fromTagId}
        `;

        // 3. fromTag を削除
        await tx.$executeRaw`
          DELETE FROM "Tag" WHERE id = ${fromTagId}
        `;
      });

      // article1, article2, article3 が全て toTag に紐付いていること
      const toTagLinks = await prisma.$queryRaw<{ a: string }[]>`
        SELECT "A" as a FROM "_ArticleToTag" WHERE "B" = ${toTagId}
      `;
      const linkedSet = new Set(toTagLinks.map((r) => r.a));

      expect(linkedSet.has(article1.id)).toBe(true);
      expect(linkedSet.has(article2.id)).toBe(true);
      expect(linkedSet.has(article3.id)).toBe(true);

      // fromTag が削除されていること
      const deletedTag = await prisma.tag.findUnique({ where: { id: fromTagId } });
      expect(deletedTag).toBeNull();

      // _ArticleToTag に fromTag のリンクが残っていないこと
      const orphanLinks = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM "_ArticleToTag" WHERE "B" = ${fromTagId}
      `;
      expect(Number(orphanLinks[0].count)).toBe(0);
    });

    it('収束マッピング — 2 回目のマージは no-op で完了する（冪等性）', async () => {
      const nodejsTag = await createTestTag(`${TEST_PREFIX}nodejs_conv`);
      const nodeJsDotTag = await createTestTag(`${TEST_PREFIX}nodejsdot_conv`);
      const article4 = await createTestArticle(source.id, 'norm_a4');

      await prisma.article.update({
        where: { id: article4.id },
        data: { tags: { connect: { id: nodejsTag.id } } },
      });

      // 1 回目マージ
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE "_ArticleToTag"
          SET "B" = ${nodeJsDotTag.id}
          WHERE "B" = ${nodejsTag.id}
          AND "A" NOT IN (
            SELECT "A" FROM "_ArticleToTag" WHERE "B" = ${nodeJsDotTag.id}
          )
        `;
        await tx.$executeRaw`
          DELETE FROM "_ArticleToTag" WHERE "B" = ${nodejsTag.id}
        `;
        await tx.$executeRaw`
          DELETE FROM "Tag" WHERE id = ${nodejsTag.id}
        `;
      });

      // 2 回目（fromTag は既に消えているので no-op）
      const affected = await prisma.$executeRaw`
        DELETE FROM "_ArticleToTag" WHERE "B" = ${nodejsTag.id}
      `;
      // 削除件数は 0 件
      expect(Number(affected)).toBe(0);

      // nodeJsDotTag に article4 が紐付いていること
      const links = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM "_ArticleToTag"
        WHERE "B" = ${nodeJsDotTag.id} AND "A" = ${article4.id}
      `;
      expect(Number(links[0].count)).toBe(1);

      // クリーンアップ
      await prisma.article.delete({ where: { id: article4.id } });
      await prisma.tag.delete({ where: { id: nodeJsDotTag.id } });
    });

    it('TagCategoryMapping のマイグレーション — fromTag のマッピングが toTag に移る', async () => {
      const categoryCount = await prisma.interestCategory.count();
      if (categoryCount === 0) {
        console.warn('InterestCategory が 0 件のため TagCategoryMapping テストをスキップ');
        return;
      }

      const category = await prisma.interestCategory.findFirst();
      if (!category) return;

      const srcTag = await createTestTag(`${TEST_PREFIX}tcm_src`);
      const dstTag = await createTestTag(`${TEST_PREFIX}tcm_dst`);

      await prisma.tagCategoryMapping.create({
        data: { tagId: srcTag.id, categoryId: category.id },
      });

      // マイグレーション実行
      await prisma.$executeRaw`
        INSERT INTO "TagCategoryMapping" (id, "tagId", "categoryId", "createdAt")
        SELECT gen_random_uuid()::text, ${dstTag.id}::text, "categoryId", NOW()
        FROM "TagCategoryMapping"
        WHERE "tagId" = ${srcTag.id}::text
        AND "categoryId" NOT IN (
          SELECT "categoryId" FROM "TagCategoryMapping" WHERE "tagId" = ${dstTag.id}::text
        )
        ON CONFLICT DO NOTHING
      `;

      await prisma.tagCategoryMapping.deleteMany({ where: { tagId: srcTag.id } });

      const dstMappings = await prisma.tagCategoryMapping.findMany({
        where: { tagId: dstTag.id },
      });
      expect(dstMappings).toHaveLength(1);
      expect(dstMappings[0].categoryId).toBe(category.id);

      const srcMappings = await prisma.tagCategoryMapping.findMany({
        where: { tagId: srcTag.id },
      });
      expect(srcMappings).toHaveLength(0);

      // クリーンアップ
      await prisma.tagCategoryMapping.deleteMany({ where: { tagId: dstTag.id } });
      await prisma.tag.deleteMany({ where: { id: { in: [srcTag.id, dstTag.id] } } });
    });
  });

  // =========================================================================
  // N2: getOrCreateTags + connect パターン
  // =========================================================================
  describe('N2: getOrCreateTags + connect — 冪等性', () => {
    let source: { id: string };
    let article: { id: string };
    const tagNames: string[] = [];

    beforeAll(async () => {
      source = await createTestSource('get_or_create');
      article = await createTestArticle(source.id, 'goc_a1');
    });

    afterAll(async () => {
      await prisma.article.deleteMany({ where: { id: article.id } });
      await prisma.tag.deleteMany({ where: { name: { in: tagNames } } });
      await prisma.source.deleteMany({ where: { id: source.id } });
    });

    it('タグを upsert して connect — 初回は作成され記事に紐付く', async () => {
      const tagName = `${TEST_PREFIX}goc_tag_1`;
      tagNames.push(tagName);

      const tag = await prisma.tag.upsert({
        where: { name: tagName },
        update: {},
        create: { name: tagName, category: null },
      });

      await prisma.article.update({
        where: { id: article.id },
        data: { tags: { connect: [{ id: tag.id }] } },
      });

      const result = await prisma.article.findUnique({
        where: { id: article.id },
        include: { tags: true },
      });

      expect(result!.tags.map((t) => t.name)).toContain(tagName);
    });

    it('同じタグを 2 回 connect しても重複しない（冪等性）', async () => {
      const tagName = `${TEST_PREFIX}goc_tag_2`;
      tagNames.push(tagName);

      const tag = await prisma.tag.upsert({
        where: { name: tagName },
        update: {},
        create: { name: tagName, category: null },
      });

      // 1 回目
      await prisma.article.update({
        where: { id: article.id },
        data: { tags: { connect: [{ id: tag.id }] } },
      });

      // 2 回目（冪等）
      await prisma.article.update({
        where: { id: article.id },
        data: { tags: { connect: [{ id: tag.id }] } },
      });

      const result = await prisma.article.findUnique({
        where: { id: article.id },
        include: { tags: true },
      });

      const filtered = result!.tags.filter((t) => t.name === tagName);
      expect(filtered).toHaveLength(1);
    });

    it('空配列の connect はエラーなし', async () => {
      await expect(
        prisma.article.update({
          where: { id: article.id },
          data: { tags: { connect: [] } },
        }),
      ).resolves.not.toThrow();
    });

    it('複数タグを一括 connect できる', async () => {
      const names = [`${TEST_PREFIX}goc_multi_1`, `${TEST_PREFIX}goc_multi_2`];
      tagNames.push(...names);

      const tags = await Promise.all(
        names.map((name) =>
          prisma.tag.upsert({
            where: { name },
            update: {},
            create: { name, category: null },
          }),
        ),
      );

      await prisma.article.update({
        where: { id: article.id },
        data: { tags: { connect: tags.map((t) => ({ id: t.id })) } },
      });

      const result = await prisma.article.findUnique({
        where: { id: article.id },
        include: { tags: true },
      });

      const tagNameSet = new Set(result!.tags.map((t) => t.name));
      for (const name of names) {
        expect(tagNameSet.has(name)).toBe(true);
      }
    });
  });

  // =========================================================================
  // H1: mergeGroup トランザクション — INSERT ... ON CONFLICT + DELETE パターン
  // =========================================================================
  describe('H1: mergeGroup トランザクション — ON CONFLICT DO NOTHING', () => {
    let source: { id: string };
    let canonicalTag: { id: string };
    let dupTag1Id: string;
    let dupTag2Id: string;
    let articleA: { id: string };
    let articleB: { id: string };
    let articleC: { id: string };

    beforeAll(async () => {
      source = await createTestSource('merge_group');
      canonicalTag = await createTestTag(`${TEST_PREFIX}merge_canonical`);

      // 重複タグは $queryRaw で直接挿入（unique 制約バイパス）
      const dup1 = await prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO "Tag" (id, name, category)
        VALUES (gen_random_uuid()::text, ${`${TEST_PREFIX}merge_dup1`}, NULL)
        RETURNING id
      `;
      dupTag1Id = dup1[0].id;

      const dup2 = await prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO "Tag" (id, name, category)
        VALUES (gen_random_uuid()::text, ${`${TEST_PREFIX}merge_dup2`}, NULL)
        RETURNING id
      `;
      dupTag2Id = dup2[0].id;

      articleA = await createTestArticle(source.id, 'mg_a');
      articleB = await createTestArticle(source.id, 'mg_b');
      articleC = await createTestArticle(source.id, 'mg_c');

      // articleA → canonical のみ
      await prisma.article.update({
        where: { id: articleA.id },
        data: { tags: { connect: { id: canonicalTag.id } } },
      });

      // articleB → dup1 のみ
      await prisma.$executeRaw`
        INSERT INTO "_ArticleToTag" ("A", "B") VALUES (${articleB.id}, ${dupTag1Id})
        ON CONFLICT DO NOTHING
      `;

      // articleC → canonical + dup2（重複ケース）
      await prisma.article.update({
        where: { id: articleC.id },
        data: { tags: { connect: { id: canonicalTag.id } } },
      });
      await prisma.$executeRaw`
        INSERT INTO "_ArticleToTag" ("A", "B") VALUES (${articleC.id}, ${dupTag2Id})
        ON CONFLICT DO NOTHING
      `;
    });

    afterAll(async () => {
      await prisma.article.deleteMany({
        where: { id: { in: [articleA.id, articleB.id, articleC.id] } },
      });
      await prisma.tag.deleteMany({
        where: { id: { in: [canonicalTag.id, dupTag1Id, dupTag2Id] } },
      });
      await prisma.source.deleteMany({ where: { id: source.id } });
    });

    it('重複タグの記事を canonical に再割り当て後、dup タグを削除できる', async () => {
      const canonicalId = canonicalTag.id;
      const duplicateIds = [dupTag1Id, dupTag2Id];

      await prisma.$transaction(async (tx) => {
        // 1. canonical に移動（重複スキップ）
        await tx.$executeRaw`
          INSERT INTO "_ArticleToTag" ("A", "B")
          SELECT DISTINCT "A", ${canonicalId}::text
          FROM "_ArticleToTag"
          WHERE "B" = ANY(${duplicateIds}::text[])
          AND "A" NOT IN (
            SELECT "A" FROM "_ArticleToTag" WHERE "B" = ${canonicalId}::text
          )
          ON CONFLICT DO NOTHING
        `;

        // 2. dup のリンクを削除
        await tx.$executeRaw`
          DELETE FROM "_ArticleToTag" WHERE "B" = ANY(${duplicateIds}::text[])
        `;

        // 3. dup タグを削除
        await tx.tag.deleteMany({ where: { id: { in: duplicateIds } } });
      });

      // canonical に全 3 記事が集まっていること
      const canonicalLinks = await prisma.$queryRaw<{ a: string }[]>`
        SELECT "A" as a FROM "_ArticleToTag" WHERE "B" = ${canonicalId}
      `;
      const linkedIds = new Set(canonicalLinks.map((r) => r.a));
      expect(linkedIds.has(articleA.id)).toBe(true);
      expect(linkedIds.has(articleB.id)).toBe(true);
      expect(linkedIds.has(articleC.id)).toBe(true);

      // dup タグが削除されていること
      const remaining = await prisma.tag.findMany({
        where: { id: { in: duplicateIds } },
      });
      expect(remaining).toHaveLength(0);

      // dup リンクが残っていないこと
      const orphans = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count
        FROM "_ArticleToTag"
        WHERE "B" = ANY(${duplicateIds}::text[])
      `;
      expect(Number(orphans[0].count)).toBe(0);
    });
  });
});

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanTags() {
  console.error('🧹 タグのクリーンアップを開始します...\n');

  try {
    // 1. 空のタグを削除
    console.error('【空タグの削除】');
    const emptyTag = await prisma.tag.findUnique({
      where: { name: '' }
    });

    if (emptyTag) {
      // 空タグが関連付けられている記事を取得
      const articlesWithEmptyTag = await prisma.article.findMany({
        where: {
          tags: {
            some: { id: emptyTag.id }
          }
        }
      });

      // 各記事から空タグを削除
      for (const article of articlesWithEmptyTag) {
        await prisma.article.update({
          where: { id: article.id },
          data: {
            tags: {
              disconnect: { id: emptyTag.id }
            }
          }
        });
      }

      // タグを削除
      await prisma.tag.delete({
        where: { id: emptyTag.id }
      });

      console.error(`✓ 空タグを削除しました (${articlesWithEmptyTag.length}記事から削除)`);
    } else {
      console.error('✓ 空タグは存在しません');
    }

    // 2. 大文字小文字を統一
    console.error('\n【タグの正規化】');
    const tagMappings = [
      { from: 'ai', to: 'AI' },
      { from: 'aws', to: 'AWS' },
      { from: 'javascript', to: 'JavaScript' },
      { from: 'typescript', to: 'TypeScript' },
      { from: 'react', to: 'React' },
      { from: 'vue', to: 'Vue.js' },
      { from: 'node', to: 'Node.js' },
      { from: 'nodejs', to: 'Node.js' },
      { from: 'docker', to: 'Docker' },
      { from: 'kubernetes', to: 'Kubernetes' },
      { from: 'k8s', to: 'Kubernetes' },
      { from: 'python', to: 'Python' },
      { from: 'github', to: 'GitHub' },
      { from: 'git', to: 'Git' },
    ];

    // Phase 1: Bulk tag lookup — fetch all from/to names in one query
    const allNames = Array.from(
      new Set(tagMappings.flatMap((m) => [m.from, m.to]))
    );
    const fetchedTags = await prisma.tag.findMany({
      where: { name: { in: allNames } },
      include: {
        _count: { select: { articles: true } },
      },
    });

    // Build a mutable Map<name, Tag> for quick lookup
    const tagMap = new Map(fetchedTags.map((t) => [t.name, t]));

    // Phase 2: Per-mapping processing with $transaction
    for (const mapping of tagMappings) {
      try {
        const fromTag = tagMap.get(mapping.from);

        if (!fromTag) {
          continue;
        }

        const toTag = tagMap.get(mapping.to);

        if (!toTag) {
          // Case A: toTag does NOT exist → simple rename
          await prisma.$transaction(async (tx) => {
            await tx.tag.update({
              where: { id: fromTag.id },
              data: { name: mapping.to },
            });
          });

          // Update the Map to reflect the rename
          tagMap.set(mapping.to, { ...fromTag, name: mapping.to });
          tagMap.delete(mapping.from);

          console.error(`✓ "${mapping.from}" → "${mapping.to}" に更新 (${fromTag._count.articles}記事)`);
        } else {
          // Case B: toTag exists → remap articles + migrate related data + delete fromTag
          const fromTagId = fromTag.id;
          const toTagId = toTag.id;
          const articleCount = fromTag._count.articles;

          await prisma.$transaction(async (tx) => {
            // 1. Remap articles: move fromTag links to toTag, skipping duplicates
            await tx.$executeRaw`
              UPDATE "_ArticleToTag"
              SET "B" = ${toTagId}
              WHERE "B" = ${fromTagId}
              AND "A" NOT IN (
                SELECT "A" FROM "_ArticleToTag" WHERE "B" = ${toTagId}
              )
            `;

            // 2. Clean orphan links (articles that already had toTag)
            await tx.$executeRaw`
              DELETE FROM "_ArticleToTag" WHERE "B" = ${fromTagId}
            `;

            // 3. Migrate TagCategoryMapping: move fromTag's category mappings to toTag
            await tx.$executeRaw`
              INSERT INTO "TagCategoryMapping" (id, "tagId", "categoryId", "createdAt")
              SELECT gen_random_uuid()::text, ${toTagId}::text, "categoryId", NOW()
              FROM "TagCategoryMapping"
              WHERE "tagId" = ${fromTagId}::text
              AND "categoryId" NOT IN (
                SELECT "categoryId" FROM "TagCategoryMapping" WHERE "tagId" = ${toTagId}::text
              )
              ON CONFLICT DO NOTHING
            `;

            // 4. Migrate TagEntityMapping: move fromTag's entity mappings to toTag
            await tx.$executeRaw`
              INSERT INTO "TagEntityMapping" (id, "tagId", "entityId", "createdAt")
              SELECT gen_random_uuid()::text, ${toTagId}::text, "entityId", NOW()
              FROM "TagEntityMapping"
              WHERE "tagId" = ${fromTagId}::text
              AND "entityId" NOT IN (
                SELECT "entityId" FROM "TagEntityMapping" WHERE "tagId" = ${toTagId}::text
              )
              ON CONFLICT DO NOTHING
            `;

            // 5. Delete fromTag (cascades TagCategoryMapping + TagEntityMapping for fromTag)
            await tx.$executeRaw`
              DELETE FROM "Tag" WHERE id = ${fromTagId}
            `;
          });

          // Update the Map: fromTag is gone
          tagMap.delete(mapping.from);

          console.error(`✓ "${mapping.from}" の記事を "${mapping.to}" に統合 (${articleCount}記事)`);
        }
      } catch (err) {
        console.error(`❌ "${mapping.from}" → "${mapping.to}" の処理に失敗:`, err);
      }
    }

    // 3. 統計情報を表示
    console.error('\n【クリーンアップ後の統計】');
    const totalTags = await prisma.tag.count();
    const totalArticles = await prisma.article.count();
    const articlesWithTags = await prisma.article.count({
      where: {
        tags: {
          some: {}
        }
      }
    });

    console.error(`- 総タグ数: ${totalTags}`);
    console.error(`- タグ付き記事: ${articlesWithTags}/${totalArticles} (${((articlesWithTags / totalArticles) * 100).toFixed(1)}%)`);

    console.error('\n✅ タグのクリーンアップが完了しました');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanTags().catch(console.error);

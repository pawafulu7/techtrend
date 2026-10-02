import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';

/**
 * fromTag の記事と TagCategoryMapping を toTag へ移し、fromTag を消す。
 * @returns 移した記事の件数（toTag に既に付いていた記事は数えない）
 */
async function mergeTagInto(
  tx: Prisma.TransactionClient,
  fromTagId: string,
  toTagId: string
): Promise<number> {
  // 1. 記事のリンクを付け替える（toTag が既に付いている記事は除く）
  const moved = await tx.$executeRaw`
    UPDATE "_ArticleToTag"
    SET "B" = ${toTagId}
    WHERE "B" = ${fromTagId}
    AND "A" NOT IN (
      SELECT "A" FROM "_ArticleToTag" WHERE "B" = ${toTagId}
    )
  `;

  // 2. 残ったリンク（toTag が既に付いていた記事）を消す
  await tx.$executeRaw`
    DELETE FROM "_ArticleToTag" WHERE "B" = ${fromTagId}
  `;

  // 3. TagCategoryMapping を toTag へ移す
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

  // 4. fromTag を消す（自分の TagCategoryMapping は CASCADE で消える）
  await tx.$executeRaw`
    DELETE FROM "Tag" WHERE id = ${fromTagId}
  `;

  return moved;
}

async function cleanTags() {
  console.error('🧹 タグのクリーンアップを開始します...\n');

  try {
    // 1. 空のタグを削除
    console.error('【空タグの削除】');
    const deleteResult = await prisma.$transaction(async (tx) => {
      const emptyTag = await tx.tag.findUnique({
        where: { name: '' },
        select: { id: true },
      });
      if (!emptyTag) return null;

      const count = await tx.$executeRaw`
        DELETE FROM "_ArticleToTag" WHERE "B" = ${emptyTag.id}
      `;

      await tx.tag.deleteMany({
        where: { id: emptyTag.id },
      });

      return count;
    });

    if (deleteResult !== null) {
      console.error(`✓ 空タグを削除しました (${deleteResult}件の関連を削除)`);
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

    // from・to のキー（lower(name)）に当たるタグをまとめて、to の表記のタグ 1 つに寄せる。
    // 名前の完全一致で引くと、大文字小文字だけが違うタグ（#672）を見落とし、
    // lower(name) の一意制約がある DB では rename が衝突するため
    const mappingErrors: Array<{ from: string; to: string; error: unknown }> =
      [];

    for (const mapping of tagMappings) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const group = await tx.$queryRaw<
            Array<{ id: string; name: string; isToKey: boolean }>
          >`
            SELECT id, name, lower(name) = lower(${mapping.to}) AS "isToKey"
            FROM "Tag"
            WHERE lower(name) IN (lower(${mapping.from}), lower(${mapping.to}))
            ORDER BY (name = ${mapping.to}) DESC,
                     (lower(name) = lower(${mapping.to})) DESC,
                     name COLLATE "C"
          `;
          if (group.length === 0) return null;

          // 先頭が統合先: to と完全一致 → to のキー → from のキーの順（ORDER BY のとおり）
          const target = group[0];
          let renamed = false;
          if (target.name !== mapping.to) {
            // 統合先は to のキーか、to のキーのタグが無いときの from のタグなので、
            // to に改名してもキーは衝突しない
            await tx.tag.update({
              where: { id: target.id },
              data: { name: mapping.to },
            });
            renamed = true;
          }

          let mergedArticles = 0;
          for (const source of group.slice(1)) {
            mergedArticles += await mergeTagInto(tx, source.id, target.id);
          }
          return { renamed, merged: group.length - 1, mergedArticles };
        });

        if (result && (result.renamed || result.merged > 0)) {
          console.error(
            `✓ "${mapping.from}" → "${mapping.to}": ${result.renamed ? '改名し、' : ''}${result.merged}件のタグを統合 (${result.mergedArticles}記事)`
          );
        }
      } catch (err) {
        console.error(
          `❌ "${mapping.from}" → "${mapping.to}" の処理に失敗:`,
          err
        );
        mappingErrors.push({ from: mapping.from, to: mapping.to, error: err });
      }
    }

    if (mappingErrors.length > 0) {
      throw new Error(
        `タグ正規化で ${mappingErrors.length} 件のマッピングが失敗: ${mappingErrors.map((e) => `${e.from}->${e.to}`).join(', ')}`
      );
    }

    // 3. 統計情報を表示
    console.error('\n【クリーンアップ後の統計】');
    const totalTags = await prisma.tag.count();
    const totalArticles = await prisma.article.count();
    const articlesWithTags = await prisma.article.count({
      where: {
        tags: {
          some: {},
        },
      },
    });

    console.error(`- 総タグ数: ${totalTags}`);
    const taggedPercent =
      totalArticles > 0
        ? ((articlesWithTags / totalArticles) * 100).toFixed(1)
        : '0.0';
    console.error(
      `- タグ付き記事: ${articlesWithTags}/${totalArticles} (${taggedPercent}%)`
    );

    console.error('\n✅ タグのクリーンアップが完了しました');
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanTags().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

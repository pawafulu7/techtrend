import { PrismaClient } from '@prisma/client';

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

    for (const mapping of tagMappings) {
      // 小文字のタグを検索
      const fromTag = await prisma.tag.findUnique({
        where: { name: mapping.from },
        include: {
          _count: {
            select: { articles: true }
          }
        }
      });

      if (!fromTag) {
        continue;
      }

      // 正規化されたタグが既に存在するか確認
      const toTag = await prisma.tag.findUnique({
        where: { name: mapping.to }
      });

      if (!toTag) {
        // 正規化されたタグが存在しない場合は、タグ名を更新
        await prisma.tag.update({
          where: { id: fromTag.id },
          data: { name: mapping.to }
        });
        console.error(`✓ "${mapping.from}" → "${mapping.to}" に更新 (${fromTag._count.articles}記事)`);
      } else {
        // 正規化されたタグが既に存在する場合は、記事を移動してから削除
        const articlesWithFromTag = await prisma.article.findMany({
          where: {
            tags: {
              some: { id: fromTag.id }
            }
          }
        });

        // 各記事のタグを更新
        for (const article of articlesWithFromTag) {
          await prisma.article.update({
            where: { id: article.id },
            data: {
              tags: {
                disconnect: { id: fromTag.id },
                connect: { id: toTag.id }
              }
            }
          });
        }

        // 古いタグを削除
        await prisma.tag.delete({
          where: { id: fromTag.id }
        });

        console.error(`✓ "${mapping.from}" の記事を "${mapping.to}" に統合 (${articlesWithFromTag.length}記事)`);
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
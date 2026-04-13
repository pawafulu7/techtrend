import { createPrismaClient } from '@/lib/prisma/create-client';

const prisma = createPrismaClient();

async function cleanupArticleTag() {
  try {
    // トランザクションで実行
    await prisma.$transaction(async (tx) => {
      // articleタグのIDを取得
      const articleTag = await tx.tag.findFirst({
        where: { name: 'article' }
      });
      
      if (!articleTag) {
        console.error('❌ articleタグが見つかりません');
        return;
      }
      
      console.error(`📋 articleタグ情報: ID=${articleTag.id}`);
      
      // このタグを持つ記事数を確認
      const articleCount = await tx.article.count({
        where: {
          tags: {
            some: {
              id: articleTag.id
            }
          }
        }
      });
      
      console.error(`📊 影響を受ける記事数: ${articleCount}件`);
      
      // 関連を削除（Prismaの多対多リレーション）
      const deletedRelations = await tx.$executeRaw`
        DELETE FROM _ArticleToTag 
        WHERE B = ${articleTag.id}
      `;
      
      console.error(`✅ ${deletedRelations}件の関連を削除しました`);
      
      // タグ自体を削除
      await tx.tag.delete({
        where: { id: articleTag.id }
      });
      
      console.error('✅ articleタグを削除しました');
    });
    
    console.error('🎉 クリーンアップ完了！');
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupArticleTag();
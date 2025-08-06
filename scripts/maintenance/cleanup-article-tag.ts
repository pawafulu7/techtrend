import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupArticleTag() {
  try {
    // トランザクションで実行
    await prisma.$transaction(async (tx) => {
      // articleタグのIDを取得
      const articleTag = await tx.tag.findFirst({
        where: { name: 'article' }
      });
      
      if (!articleTag) {
        console.log('❌ articleタグが見つかりません');
        return;
      }
      
      console.log(`📋 articleタグ情報: ID=${articleTag.id}`);
      
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
      
      console.log(`📊 影響を受ける記事数: ${articleCount}件`);
      
      // 関連を削除（Prismaの多対多リレーション）
      const deletedRelations = await tx.$executeRaw`
        DELETE FROM _ArticleToTag 
        WHERE B = ${articleTag.id}
      `;
      
      console.log(`✅ ${deletedRelations}件の関連を削除しました`);
      
      // タグ自体を削除
      await tx.tag.delete({
        where: { id: articleTag.id }
      });
      
      console.log('✅ articleタグを削除しました');
    });
    
    console.log('🎉 クリーンアップ完了！');
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupArticleTag();
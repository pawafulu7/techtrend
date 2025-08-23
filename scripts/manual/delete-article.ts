import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function deleteArticle() {
  try {
    // 削除前に記事情報を取得
    const article = await prisma.article.findUnique({
      where: { id: 'cmenpojif0002tebjl4j8pwte' },
      include: { tags: true }
    });
    
    if (!article) {
      console.log('記事が見つかりません');
      return;
    }
    
    console.log('削除する記事:');
    console.log('- ID:', article.id);
    console.log('- タイトル:', article.title);
    console.log('- URL:', article.url);
    console.log('- タグ数:', article.tags.length);
    
    // 関連データを先に削除
    console.log('\n関連データを削除中...');
    
    // ArticleViewを削除
    const viewsDeleted = await prisma.articleView.deleteMany({
      where: { articleId: 'cmenpojif0002tebjl4j8pwte' }
    });
    console.log(`- ${viewsDeleted.count}件の閲覧履歴を削除`);
    
    // FavoriteArticleを削除（存在する場合）
    try {
      const favoritesDeleted = await (prisma as any).favoriteArticle?.deleteMany({
        where: { articleId: 'cmenpojif0002tebjl4j8pwte' }
      });
      if (favoritesDeleted) {
        console.log(`- ${favoritesDeleted.count}件のお気に入りを削除`);
      }
    } catch (e) {
      // FavoriteArticleモデルが存在しない場合はスキップ
    }
    
    // 記事を削除（関連するタグのリレーションも自動的に削除される）
    await prisma.article.delete({
      where: { id: 'cmenp1vql0006tej948bvift9' }
    });
    
    console.log('\n✅ 記事を削除しました');
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteArticle();
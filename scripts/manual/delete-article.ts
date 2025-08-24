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
      console.error('記事が見つかりません');
      return;
    }
    
    console.error('削除する記事:');
    console.error('- ID:', article.id);
    console.error('- タイトル:', article.title);
    console.error('- URL:', article.url);
    console.error('- タグ数:', article.tags.length);
    
    // 関連データを先に削除
    console.error('\n関連データを削除中...');
    
    // ArticleViewを削除
    const viewsDeleted = await prisma.articleView.deleteMany({
      where: { articleId: 'cmenpojif0002tebjl4j8pwte' }
    });
    console.error(`- ${viewsDeleted.count}件の閲覧履歴を削除`);
    
    // FavoriteArticleを削除（存在する場合）
    try {
      const favoritesDeleted = await (prisma as any).favoriteArticle?.deleteMany({
        where: { articleId: 'cmenpojif0002tebjl4j8pwte' }
      });
      if (favoritesDeleted) {
        console.error(`- ${favoritesDeleted.count}件のお気に入りを削除`);
      }
    } catch (e) {
      // FavoriteArticleモデルが存在しない場合はスキップ
    }
    
    // 記事を削除（関連するタグのリレーションも自動的に削除される）
    await prisma.article.delete({
      where: { id: 'cmenp1vql0006tej948bvift9' }
    });
    
    console.error('\n✅ 記事を削除しました');
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteArticle();
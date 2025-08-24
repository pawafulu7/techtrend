import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkArticleContent() {
  const articleId = 'cmdu8emur000qte8dxervwvwa';
  
  const article = await prisma.article.findUnique({
    where: { id: articleId }
  });

  if (!article) {
    console.error(`記事ID ${articleId} が見つかりません`);
    return;
  }

  console.error('=== 記事コンテンツ全文 ===');
  console.error(article.content || 'コンテンツなし');
  console.error('\n=== 記事の要約 ===');
  console.error(article.summary || '要約なし');
  console.error('\n=== 記事のdescription ===');
  console.error(article.description || 'descriptionなし');
  
  // 要約とコンテンツの関連性をチェック
  if (article.content) {
    const contentIncludes = {
      using宣言: article.content.includes('using'),
      makeTempDir: article.content.includes('makeTempDir'),
      自動削除: article.content.includes('自動削除') || article.content.includes('自動的に削除'),
      リソース管理: article.content.includes('リソース管理')
    };
    
    console.error('\n=== コンテンツ内のキーワード確認 ===');
    Object.entries(contentIncludes).forEach(([key, value]) => {
      console.error(`${key}: ${value ? '含まれる' : '含まれない'}`);
    });
  }
  
  await prisma.$disconnect();
}

checkArticleContent();
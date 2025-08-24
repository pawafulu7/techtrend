import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function compareArticles() {
  const articleIds = [
    'cmdu8emur000qte8dxervwvwa',
    'cmdu8emo70002te8d2ttakzky'
  ];

  for (const articleId of articleIds) {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: {
        source: true,
        tags: true
      }
    });

    if (!article) {
      console.error(`記事ID ${articleId} が見つかりません`);
      continue;
    }

    console.error('='*60);
    console.error(`記事ID: ${article.id}`);
    console.error(`タイトル: ${article.title}`);
    console.error(`ソース: ${article.source.name}`);
    console.error(`公開日: ${article.publishedAt.toLocaleString('ja-JP')}`);
    console.error(`作成日: ${article.createdAt.toLocaleString('ja-JP')}`);
    console.error(`更新日: ${article.updatedAt.toLocaleString('ja-JP')}`);
    console.error('\n--- 要約 ---');
    console.error(article.summary);
    console.error('\n--- 詳細要約 ---');
    console.error(article.detailedSummary);
    console.error('\n--- タグ ---');
    console.error(article.tags.map(t => t.name).join(', '));
    console.error('\n');
  }
  
  await prisma.$disconnect();
}

compareArticles();
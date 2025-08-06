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
      console.log(`記事ID ${articleId} が見つかりません`);
      continue;
    }

    console.log('='*60);
    console.log(`記事ID: ${article.id}`);
    console.log(`タイトル: ${article.title}`);
    console.log(`ソース: ${article.source.name}`);
    console.log(`公開日: ${article.publishedAt.toLocaleString('ja-JP')}`);
    console.log(`作成日: ${article.createdAt.toLocaleString('ja-JP')}`);
    console.log(`更新日: ${article.updatedAt.toLocaleString('ja-JP')}`);
    console.log('\n--- 要約 ---');
    console.log(article.summary);
    console.log('\n--- 詳細要約 ---');
    console.log(article.detailedSummary);
    console.log('\n--- タグ ---');
    console.log(article.tags.map(t => t.name).join(', '));
    console.log('\n');
  }
  
  await prisma.$disconnect();
}

compareArticles();
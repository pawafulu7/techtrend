import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkArticle() {
  const articleId = 'cmdu8emur000qte8dxervwvwa';
  
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: {
      source: true,
      tags: true
    }
  });

  if (!article) {
    console.error(`記事ID ${articleId} が見つかりません`);
    return;
  }

  console.error('記事詳細:');
  console.error(`ID: ${article.id}`);
  console.error(`タイトル: ${article.title}`);
  console.error(`URL: ${article.url}`);
  console.error(`ソース: ${article.source.name}`);
  console.error(`公開日: ${article.publishedAt.toLocaleString('ja-JP')}`);
  console.error(`作成日: ${article.createdAt.toLocaleString('ja-JP')}`);
  console.error(`更新日: ${article.updatedAt.toLocaleString('ja-JP')}`);
  console.error(`\n要約: ${article.summary}`);
  console.error(`\n詳細要約: ${article.detailedSummary}`);
  console.error(`\nコンテンツ（最初の500文字）: ${article.content?.substring(0, 500) || 'なし'}`);
  console.error(`\nタグ: ${article.tags.map(t => t.name).join(', ')}`);
  
  await prisma.$disconnect();
}

checkArticle();
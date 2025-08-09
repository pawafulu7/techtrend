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
    console.log(`記事ID ${articleId} が見つかりません`);
    return;
  }

  console.log('記事詳細:');
  console.log(`ID: ${article.id}`);
  console.log(`タイトル: ${article.title}`);
  console.log(`URL: ${article.url}`);
  console.log(`ソース: ${article.source.name}`);
  console.log(`公開日: ${article.publishedAt.toLocaleString('ja-JP')}`);
  console.log(`作成日: ${article.createdAt.toLocaleString('ja-JP')}`);
  console.log(`更新日: ${article.updatedAt.toLocaleString('ja-JP')}`);
  console.log(`\n要約: ${article.summary}`);
  console.log(`\n詳細要約: ${article.detailedSummary}`);
  console.log(`\nコンテンツ（最初の500文字）: ${article.content?.substring(0, 500) || 'なし'}`);
  console.log(`\nタグ: ${article.tags.map(t => t.name).join(', ')}`);
  
  await prisma.$disconnect();
}

checkArticle();
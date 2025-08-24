import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSpeakerDeckArticles() {
  try {
    // Speaker Deckソースを取得
    const source = await prisma.source.findFirst({
      where: { name: 'Speaker Deck' }
    });
    
    if (!source) {
      console.error('Speaker Deckソースが見つかりません');
      return;
    }
    
    // 最新の記事を取得
    const articles = await prisma.article.findMany({
      where: { sourceId: source.id },
      orderBy: { publishedAt: 'desc' },
      take: 10
    });
    
    console.error(`\n=== Speaker Deck記事の確認 (最新10件) ===`);
    console.error(`合計記事数: ${articles.length}\n`);
    
    articles.forEach((article, index) => {
      console.error(`--- 記事 #${index + 1} ---`);
      console.error(`タイトル: ${article.title.substring(0, 50)}...`);
      console.error(`公開日: ${article.publishedAt.toISOString()}`);
      console.error(`要約: ${article.summary ? article.summary.substring(0, 50) + '...' : 'NULL'}`);
      console.error(`詳細要約: ${article.detailedSummary ? article.detailedSummary.substring(0, 50) + '...' : 'NULL'}`);
      console.error(`コンテンツ: ${article.content ? article.content.substring(0, 50) + '...' : 'NULL'}`);
      console.error(`説明: ${article.description ? article.description.substring(0, 50) + '...' : 'NULL'}`);
      console.error('');
    });
    
    // 要約がない記事をカウント
    const articlesWithoutSummary = await prisma.article.count({
      where: { 
        sourceId: source.id,
        summary: null
      }
    });
    
    const articlesWithoutDetailedSummary = await prisma.article.count({
      where: { 
        sourceId: source.id,
        detailedSummary: null
      }
    });
    
    const totalArticles = await prisma.article.count({
      where: { sourceId: source.id }
    });
    
    console.error(`\n=== 統計情報 ===`);
    console.error(`総記事数: ${totalArticles}`);
    console.error(`要約なし: ${articlesWithoutSummary} (${(articlesWithoutSummary/totalArticles*100).toFixed(1)}%)`);
    console.error(`詳細要約なし: ${articlesWithoutDetailedSummary} (${(articlesWithoutDetailedSummary/totalArticles*100).toFixed(1)}%)`);
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSpeakerDeckArticles();
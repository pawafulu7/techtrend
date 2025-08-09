import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRecentSpeakerDeck() {
  try {
    const source = await prisma.source.findFirst({
      where: { name: 'Speaker Deck' }
    });
    
    if (!source) {
      console.log('Speaker Deckソースが見つかりません');
      return;
    }
    
    // 今日追加された記事を確認
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayArticles = await prisma.article.findMany({
      where: { 
        sourceId: source.id,
        createdAt: { gte: today }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`\n=== 今日追加されたSpeaker Deck記事 ===`);
    console.log(`件数: ${todayArticles.length}\n`);
    
    todayArticles.forEach((article, index) => {
      console.log(`--- 記事 #${index + 1} ---`);
      console.log(`タイトル: ${article.title}`);
      console.log(`作成日時: ${article.createdAt.toISOString()}`);
      console.log(`公開日: ${article.publishedAt.toISOString()}`);
      console.log(`コンテンツ長: ${article.content?.length || 0}文字`);
      console.log(`説明長: ${article.description?.length || 0}文字`);
      console.log(`要約: ${article.summary ? 'あり' : 'なし'}`);
      console.log('');
    });
    
    // 昨日追加された記事も確認
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const yesterdayArticles = await prisma.article.findMany({
      where: { 
        sourceId: source.id,
        createdAt: { 
          gte: yesterday,
          lt: today
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    
    console.log(`\n=== 昨日追加されたSpeaker Deck記事（最新5件） ===`);
    console.log(`件数: ${yesterdayArticles.length}\n`);
    
    yesterdayArticles.forEach((article, index) => {
      console.log(`--- 記事 #${index + 1} ---`);
      console.log(`タイトル: ${article.title.substring(0, 50)}...`);
      console.log(`作成日時: ${article.createdAt.toISOString()}`);
      console.log(`コンテンツ長: ${article.content?.length || 0}文字`);
      console.log(`説明長: ${article.description?.length || 0}文字`);
      console.log(`要約: ${article.summary ? 'あり' : 'なし'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRecentSpeakerDeck();
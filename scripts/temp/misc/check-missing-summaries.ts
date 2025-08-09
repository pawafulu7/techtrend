import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sources = await prisma.source.findMany({
    where: { name: { in: ['Corporate Tech Blog', 'Speaker Deck'] }}
  });
  
  const articles = await prisma.article.findMany({
    where: { 
      sourceId: { in: sources.map(s => s.id) },
      summary: null 
    },
    take: 5,
    select: { 
      title: true, 
      url: true,
      createdAt: true,
      content: true
    }
  });
  
  console.log('要約がない記事のサンプル:');
  articles.forEach((a, i) => {
    console.log(`${i+1}. ${a.title}`);
    console.log(`   URL: ${a.url}`);
    console.log(`   作成日: ${a.createdAt}`);
    console.log(`   コンテンツ長: ${a.content ? a.content.length : 0}文字`);
  });
  
  // 統計情報
  const corporateStats = await prisma.article.count({
    where: {
      sourceId: { in: sources.filter(s => s.name === 'Corporate Tech Blog').map(s => s.id) },
      summary: null
    }
  });
  
  const speakerStats = await prisma.article.count({
    where: {
      sourceId: { in: sources.filter(s => s.name === 'Speaker Deck').map(s => s.id) },
      summary: null
    }
  });
  
  console.log('\n統計情報:');
  console.log(`Corporate Tech Blog: 要約なし ${corporateStats}件`);
  console.log(`Speaker Deck: 要約なし ${speakerStats}件`);
  
  // 最近の要約生成状況を確認
  const recentWithSummary = await prisma.article.count({
    where: {
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      summary: { not: null }
    }
  });
  
  const recentTotal = await prisma.article.count({
    where: {
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  });
  
  console.log(`\n過去24時間の要約生成率: ${recentWithSummary}/${recentTotal} (${Math.round(recentWithSummary / recentTotal * 100)}%)`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
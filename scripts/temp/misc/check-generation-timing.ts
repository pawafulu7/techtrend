import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkGenerationTiming() {
  const articleIds = [
    'cmdu8emur000qte8dxervwvwa',
    'cmdu8emo70002te8d2ttakzky'
  ];

  const articles = await prisma.article.findMany({
    where: {
      id: { in: articleIds }
    },
    orderBy: {
      updatedAt: 'asc'
    },
    include: {
      source: true
    }
  });

  console.error('=== 記事の生成タイミング比較 ===\n');
  
  articles.forEach((article, index) => {
    console.error(`記事${index + 1}:`);
    console.error(`  ID: ${article.id}`);
    console.error(`  タイトル: ${article.title}`);
    console.error(`  ソース: ${article.source.name}`);
    console.error(`  公開日時: ${article.publishedAt.toLocaleString('ja-JP')}`);
    console.error(`  DB作成日時: ${article.createdAt.toLocaleString('ja-JP')}`);
    console.error(`  DB更新日時: ${article.updatedAt.toLocaleString('ja-JP')}`);
    console.error(`  要約あり: ${article.summary ? 'はい' : 'いいえ'}`);
    console.error(`  詳細要約あり: ${article.detailedSummary ? 'はい' : 'いいえ'}`);
    console.error('');
  });

  // 時間差を計算
  if (articles.length === 2) {
    const timeDiff = Math.abs(articles[0].updatedAt.getTime() - articles[1].updatedAt.getTime());
    const seconds = Math.floor(timeDiff / 1000);
    console.error(`更新時刻の差: ${seconds}秒`);
    
    if (seconds < 60) {
      console.error('→ ほぼ同時に要約が生成されています（同一バッチ処理の可能性が高い）');
    } else {
      console.error('→ 異なるタイミングで要約が生成されています');
    }
  }

  // 同時期に生成された他の記事も確認
  const startTime = new Date(Math.min(...articles.map(a => a.updatedAt.getTime())) - 60000); // 1分前
  const endTime = new Date(Math.max(...articles.map(a => a.updatedAt.getTime())) + 60000); // 1分後
  
  const nearbyArticles = await prisma.article.findMany({
    where: {
      updatedAt: {
        gte: startTime,
        lte: endTime
      },
      source: {
        name: 'Zenn'
      }
    },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      detailedSummary: true
    },
    orderBy: {
      updatedAt: 'asc'
    }
  });

  console.error(`\n=== 同時期（${startTime.toLocaleTimeString('ja-JP')} - ${endTime.toLocaleTimeString('ja-JP')}）に生成されたZenn記事 ===`);
  nearbyArticles.forEach(article => {
    const hasLabel = article.detailedSummary?.includes('記事の主題は') || 
                     article.detailedSummary?.includes('具体的な問題は');
    console.error(`${article.updatedAt.toLocaleTimeString('ja-JP')} - ${article.id} - ラベル${hasLabel ? 'あり' : 'なし'}`);
  });
  
  await prisma.$disconnect();
}

checkGenerationTiming();
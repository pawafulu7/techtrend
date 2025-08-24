#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSummary() {
  const article = await prisma.article.findUnique({ 
    where: { id: 'cme3sdz74000fte6gig7urb0t' },
    select: { detailedSummary: true }
  });
  
  console.error('現在の詳細要約:');
  console.error('=====================================');
  console.error(article?.detailedSummary);
  console.error('=====================================\n');
  
  if (article?.detailedSummary) {
    const lines = article.detailedSummary.split('\n');
    console.error('分析結果:');
    console.error(`  行数: ${lines.length}`);
    console.error(`  合計文字数: ${article.detailedSummary.length}`);
    console.error('\n各行の確認:');
    lines.forEach((line, i) => {
      const startsWithBullet = line.startsWith('・');
      console.error(`  行${i+1}: ${startsWithBullet ? '✅' : '❌'} "${line.substring(0, 20)}..."`);
    });
    
    const isBulletFormat = lines.every(line => line.startsWith('・'));
    console.error(`\n箇条書き形式チェック: ${isBulletFormat ? '✅ OK' : '❌ NG (改行されていない)'}`);
  }
  
  await prisma.$disconnect();
}

checkSummary();
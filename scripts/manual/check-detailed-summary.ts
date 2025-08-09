#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSummary() {
  const article = await prisma.article.findUnique({ 
    where: { id: 'cme3sdz74000fte6gig7urb0t' },
    select: { detailedSummary: true }
  });
  
  console.log('現在の詳細要約:');
  console.log('=====================================');
  console.log(article?.detailedSummary);
  console.log('=====================================\n');
  
  if (article?.detailedSummary) {
    const lines = article.detailedSummary.split('\n');
    console.log('分析結果:');
    console.log(`  行数: ${lines.length}`);
    console.log(`  合計文字数: ${article.detailedSummary.length}`);
    console.log('\n各行の確認:');
    lines.forEach((line, i) => {
      const startsWithBullet = line.startsWith('・');
      console.log(`  行${i+1}: ${startsWithBullet ? '✅' : '❌'} "${line.substring(0, 20)}..."`);
    });
    
    const isBulletFormat = lines.every(line => line.startsWith('・'));
    console.log(`\n箇条書き形式チェック: ${isBulletFormat ? '✅ OK' : '❌ NG (改行されていない)'}`);
  }
  
  await prisma.$disconnect();
}

checkSummary();
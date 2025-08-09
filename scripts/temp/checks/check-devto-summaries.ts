#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDevtoSummaries() {
  const articles = await prisma.article.findMany({
    where: {
      source: { name: 'Dev.to' }
    },
    select: {
      id: true,
      title: true,
      summary: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  
  console.log('Dev.to 最新記事20件の要約\n');
  console.log('='.repeat(100));
  
  articles.forEach((a, i) => {
    console.log(`\n${i+1}. [${a.id}]`);
    console.log(`📝 ${a.title?.substring(0, 60)}...`);
    console.log(`📄 ${a.summary}`);
    
    // 問題のパターンを検出
    const issues = [];
    const s = a.summary || '';
    
    if (s.length < 60) issues.push('短すぎ');
    if (s.length > 130) issues.push('長すぎ');
    
    const japaneseChars = (s.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
    const japaneseRatio = s.length > 0 ? japaneseChars / s.length : 0;
    if (japaneseRatio < 0.5) issues.push('英語混在');
    
    if (s.includes('解説') || s.includes('紹介') || s.includes('説明')) issues.push('一般的');
    if (s.includes('する記事') || s.includes('した記事')) issues.push('記事言及');
    if (!s.endsWith('。')) issues.push('句点なし');
    
    if (issues.length > 0) {
      console.log(`⚠️ 問題: ${issues.join(', ')}`);
    }
  });
  
  console.log('\n' + '='.repeat(100));
  
  // 全体統計
  const allArticles = await prisma.article.count({
    where: { source: { name: 'Dev.to' } }
  });
  
  console.log(`\nDev.to 記事総数: ${allArticles}件`);
  
  // 問題のある記事を集計
  const problemArticles = await prisma.article.findMany({
    where: {
      source: { name: 'Dev.to' }
    },
    select: {
      id: true,
      summary: true
    }
  });
  
  let tooShort = 0;
  let tooLong = 0;
  let englishMixed = 0;
  let generic = 0;
  let articleMention = 0;
  let noPeriod = 0;
  
  problemArticles.forEach(a => {
    const s = a.summary || '';
    
    if (s.length < 60) tooShort++;
    if (s.length > 130) tooLong++;
    
    const japaneseChars = (s.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
    const japaneseRatio = s.length > 0 ? japaneseChars / s.length : 0;
    if (japaneseRatio < 0.5) englishMixed++;
    
    if (s.includes('解説') || s.includes('紹介') || s.includes('説明')) generic++;
    if (s.includes('する記事') || s.includes('した記事')) articleMention++;
    if (!s.endsWith('。')) noPeriod++;
  });
  
  console.log('\n問題のパターン別統計:');
  console.log(`  短すぎ（<60文字）: ${tooShort}件`);
  console.log(`  長すぎ（>130文字）: ${tooLong}件`);
  console.log(`  英語混在（日本語<50%）: ${englishMixed}件`);
  console.log(`  一般的表現: ${generic}件`);
  console.log(`  「記事」言及: ${articleMention}件`);
  console.log(`  句点なし: ${noPeriod}件`);
  
  await prisma.$disconnect();
}

checkDevtoSummaries().catch(console.error);
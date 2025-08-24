import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 不要な前置き文言のパターン
const unwantedPrefixes = [
  'タイトルから判断すると',
  '記事の主題は',
  'この記事は',
  '本記事は',
  '記事の内容は',
  '本記事の主題は',
];

// 要約から不要な前置きを削除する関数
function cleanSummary(summary: string | null): string | null {
  if (!summary) return null;
  
  let cleaned = summary;
  
  // 各パターンを削除
  for (const prefix of unwantedPrefixes) {
    // 文頭のパターンを削除
    const patterns = [
      new RegExp(`^${prefix}[、，,]?\\s*`, 'g'),
      new RegExp(`^・${prefix}[、，,]?\\s*`, 'gm'),
    ];
    
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, '');
    }
  }
  
  // 詳細要約の場合、箇条書きの修正
  if (cleaned.includes('・')) {
    cleaned = cleaned.replace(/・記事の主題と技術的背景/g, '・技術的背景');
    cleaned = cleaned.replace(/・記事の主題（/g, '・技術概要（');
  }
  
  // 余分な空白を削除
  cleaned = cleaned.trim();
  
  return cleaned;
}

async function fixUnwantedPrefixes() {
  try {
    // 不要な前置きを含む記事を取得
    const articles = await prisma.article.findMany({
      where: {
        OR: unwantedPrefixes.flatMap(prefix => [
          { summary: { contains: prefix } },
          { detailedSummary: { contains: prefix } }
        ])
      },
      select: {
        id: true,
        title: true,
        summary: true,
        detailedSummary: true
      }
    });
    
    console.error(`不要な前置きを含む記事: ${articles.length}件`);
    
    // 各記事の要約を修正
    let updatedCount = 0;
    for (const article of articles) {
      const cleanedSummary = cleanSummary(article.summary);
      const cleanedDetailedSummary = cleanSummary(article.detailedSummary);
      
      // 変更がある場合のみ更新
      if (cleanedSummary !== article.summary || cleanedDetailedSummary !== article.detailedSummary) {
        console.error(`\n更新中: ${article.title}`);
        
        if (cleanedSummary !== article.summary) {
          console.error('  要約を修正');
        }
        if (cleanedDetailedSummary !== article.detailedSummary) {
          console.error('  詳細要約を修正');
        }
        
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: cleanedSummary,
            detailedSummary: cleanedDetailedSummary
          }
        });
        
        updatedCount++;
      }
    }
    
    console.error(`\n修正完了: ${updatedCount}件の記事を更新しました。`);
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行前の確認
async function main() {
  console.error('既存の要約から不要な前置き文言を削除します。');
  console.error('削除対象の前置き:', unwantedPrefixes.join(', '));
  console.error('\n続行しますか？ (y/n)');
  
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  readline.question('', async (answer) => {
    if (answer.toLowerCase() === 'y') {
      await fixUnwantedPrefixes();
    } else {
      console.error('キャンセルしました。');
      await prisma.$disconnect();
    }
    readline.close();
  });
}

main().catch(console.error);
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeSummaryStructure() {
  const articleIds = [
    'cmdu8emur000qte8dxervwvwa',
    'cmdu8emo70002te8d2ttakzky'
  ];

  for (const articleId of articleIds) {
    const article = await prisma.article.findUnique({
      where: { id: articleId }
    });

    if (!article || !article.detailedSummary) {
      console.log(`記事ID ${articleId} が見つからないか、詳細要約がありません`);
      continue;
    }

    console.log('='*60);
    console.log(`記事ID: ${articleId}`);
    console.log(`タイトル: ${article.title}`);
    console.log('\n--- 詳細要約の構造分析 ---');
    
    const lines = article.detailedSummary.split('\n');
    lines.forEach((line, index) => {
      if (line.trim().startsWith('・')) {
        const content = line.trim().substring(1).trim();
        const firstSentenceEnd = content.search(/[。、]/);
        
        if (firstSentenceEnd > 0) {
          const topic = content.substring(0, firstSentenceEnd);
          const description = content.substring(firstSentenceEnd + 1).trim();
          
          console.log(`\n項目${index + 1}:`);
          console.log(`  トピック: ${topic}`);
          console.log(`  説明: ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}`);
          
          // 項目の構造パターンを判定
          if (topic.includes('記事の主題')) {
            console.log(`  パターン: 主題説明`);
          } else if (topic.includes('問題')) {
            console.log(`  パターン: 問題説明`);
          } else if (topic.includes('解決策')) {
            console.log(`  パターン: 解決策説明`);
          } else if (topic.includes('実装')) {
            console.log(`  パターン: 実装説明`);
          } else if (topic.includes('効果')) {
            console.log(`  パターン: 効果説明`);
          } else if (topic.includes('注意点')) {
            console.log(`  パターン: 注意事項`);
          }
        } else {
          console.log(`\n項目${index + 1}: ${line.trim()}`);
          console.log(`  パターン: 単一文`);
        }
      }
    });
    console.log('\n');
  }
  
  await prisma.$disconnect();
}

analyzeSummaryStructure();
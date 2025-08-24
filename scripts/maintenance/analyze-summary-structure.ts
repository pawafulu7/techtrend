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
      console.error(`記事ID ${articleId} が見つからないか、詳細要約がありません`);
      continue;
    }

    console.error('='*60);
    console.error(`記事ID: ${articleId}`);
    console.error(`タイトル: ${article.title}`);
    console.error('\n--- 詳細要約の構造分析 ---');
    
    const lines = article.detailedSummary.split('\n');
    lines.forEach((line, index) => {
      if (line.trim().startsWith('・')) {
        const content = line.trim().substring(1).trim();
        const firstSentenceEnd = content.search(/[。、]/);
        
        if (firstSentenceEnd > 0) {
          const topic = content.substring(0, firstSentenceEnd);
          const description = content.substring(firstSentenceEnd + 1).trim();
          
          console.error(`\n項目${index + 1}:`);
          console.error(`  トピック: ${topic}`);
          console.error(`  説明: ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}`);
          
          // 項目の構造パターンを判定
          if (topic.includes('記事の主題')) {
            console.error(`  パターン: 主題説明`);
          } else if (topic.includes('問題')) {
            console.error(`  パターン: 問題説明`);
          } else if (topic.includes('解決策')) {
            console.error(`  パターン: 解決策説明`);
          } else if (topic.includes('実装')) {
            console.error(`  パターン: 実装説明`);
          } else if (topic.includes('効果')) {
            console.error(`  パターン: 効果説明`);
          } else if (topic.includes('注意点')) {
            console.error(`  パターン: 注意事項`);
          }
        } else {
          console.error(`\n項目${index + 1}: ${line.trim()}`);
          console.error(`  パターン: 単一文`);
        }
      }
    });
    console.error('\n');
  }
  
  await prisma.$disconnect();
}

analyzeSummaryStructure();
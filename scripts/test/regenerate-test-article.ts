/**
 * 単一記事の要約再生成テストスクリプト
 * プロンプト変更の効果を検証するために使用
 */

import { PrismaClient } from '@prisma/client';
import { getUnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();

async function main() {
  const articleId = process.argv[2] || 'cmiepo0m10095tefz5qu6nx25';

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { source: true }
  });

  if (!article) {
    console.error('Article not found:', articleId);
    process.exit(1);
  }

  console.log('=== 記事情報 ===');
  console.log('ID:', article.id);
  console.log('タイトル:', article.title);
  console.log('コンテンツ長:', article.content?.length || 0, '文字');
  console.log('\n=== 現在の詳細要約 ===');
  console.log(article.detailedSummary);
  console.log('\n項目数:', (article.detailedSummary?.match(/^・/gm) || []).length);

  console.log('\n=== 要約再生成中... ===\n');

  const service = getUnifiedSummaryService();
  const result = await service.generate(
    article.title,
    article.content || '',
    undefined,
    { sourceName: article.source.name, url: article.url }
  );

  console.log('=== 新しい詳細要約 ===');
  console.log(result.detailedSummary);
  console.log('\n項目数:', (result.detailedSummary?.match(/^・/gm) || []).length);

  console.log('\n=== 比較 ===');
  console.log('旧項目数:', (article.detailedSummary?.match(/^・/gm) || []).length);
  console.log('新項目数:', (result.detailedSummary?.match(/^・/gm) || []).length);

  // --save オプションがある場合はDBに保存
  if (process.argv.includes('--save')) {
    await prisma.article.update({
      where: { id: articleId },
      data: {
        summary: result.summary,
        detailedSummary: result.detailedSummary,
        summaryVersion: result.summaryVersion,
        summaryComputedAt: new Date()
      }
    });
    console.log('\n✅ DBに保存しました');
  } else {
    console.log('\n💡 DBに保存するには --save オプションを付けてください');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

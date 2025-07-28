import { PrismaClient } from '@prisma/client';
import { GeminiClient } from '../lib/ai/gemini';

const prisma = new PrismaClient();
const gemini = new GeminiClient();

async function fixSummaries() {
  console.log('📝 要約の修正を開始します...');

  try {
    // 問題のある要約を持つ記事を取得
    const articles = await prisma.article.findMany({
      where: {
        OR: [
          { summary: { startsWith: '本記事' } },
          { summary: { startsWith: '本稿' } },
          { summary: { startsWith: '、' } },
          { summary: { startsWith: '。' } },
        ]
      },
      include: {
        source: true,
        tags: true,
      },
    });

    console.log(`📄 修正対象の記事数: ${articles.length}件`);

    let processedCount = 0;
    const errors: Error[] = [];

    // バッチサイズを小さくして処理
    const batchSize = 3;
    
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      console.log(`\n処理中: ${i + 1}-${Math.min(i + batchSize, articles.length)}件目`);
      
      await Promise.all(
        batch.map(async (article) => {
          try {
            const { summary, tags } = await gemini.generateSummaryWithTags(
              article.title,
              article.content || article.title
            );

            // 要約を更新
            await prisma.article.update({
              where: { id: article.id },
              data: { summary },
            });

            // 既存のタグを削除
            await prisma.article.update({
              where: { id: article.id },
              data: {
                tags: {
                  set: [], // すべてのタグの関連を削除
                },
              },
            });

            // 新しいタグを作成・関連付け
            for (const tagName of tags) {
              if (!tagName || tagName.trim() === '') continue;
              
              const tag = await prisma.tag.upsert({
                where: { name: tagName },
                update: {},
                create: { name: tagName },
              });

              await prisma.article.update({
                where: { id: article.id },
                data: {
                  tags: {
                    connect: { id: tag.id },
                  },
                },
              });
            }

            processedCount++;
            console.log(`✓ [${article.source.name}] ${article.title.substring(0, 50)}...`);
          } catch (error) {
            errors.push(error as Error);
            console.error(`✗ エラー: ${article.title.substring(0, 50)}...`, error);
          }
        })
      );
      
      // API レート制限を考慮して待機
      if (i + batchSize < articles.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (errors.length > 0) {
      console.log(`\n⚠️  エラーが発生した記事数: ${errors.length}件`);
    }

    console.log(`\n📊 要約修正完了: 成功${processedCount}件, エラー${errors.length}件`);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixSummaries().catch(console.error);
import { PrismaClient } from '@prisma/client';
import { GeminiClient } from '../lib/ai/gemini';

const prisma = new PrismaClient();
const gemini = new GeminiClient();

async function generateTagsForQiita() {
  console.log('📝 Qiita記事のタグ生成を開始します...');

  try {
    // タグがないQiita記事を取得
    const articles = await prisma.article.findMany({
      where: {
        source: {
          name: 'Qiita Popular'
        },
        tags: {
          none: {}
        }
      },
      include: {
        source: true,
        tags: true,
      },
    });

    console.log(`📄 タグがないQiita記事数: ${articles.length}件`);

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
            // タグのみ生成（要約は既存のものを使用）
            const { tags } = await gemini.generateSummaryWithTags(
              article.title,
              article.content || article.summary || article.title
            );

            // タグを作成・関連付け
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
            console.log(`✓ [${article.source.name}] ${article.title.substring(0, 50)}... (タグ: ${tags.join(', ')})`);
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

    console.log(`\n📊 タグ生成完了: 成功${processedCount}件, エラー${errors.length}件`);

    // タグ生成後の統計を表示
    const qiitaStats = await prisma.$queryRaw`
      SELECT 
        COUNT(DISTINCT a.id) as total_articles,
        COUNT(DISTINCT at.A) as articles_with_tags,
        COUNT(DISTINCT t.id) as unique_tags
      FROM Article a
      JOIN Source s ON a.sourceId = s.id
      LEFT JOIN _ArticleToTag at ON a.id = at.A
      LEFT JOIN Tag t ON at.B = t.id
      WHERE s.name = 'Qiita Popular'
    ` as { total_articles: bigint; articles_with_tags: bigint; unique_tags: bigint }[];

    const stats = qiitaStats[0];
    console.log('\n【Qiita Popular統計】');
    console.log(`総記事数: ${stats.total_articles}件`);
    console.log(`タグ付き記事数: ${stats.articles_with_tags}件 (${((Number(stats.articles_with_tags) / Number(stats.total_articles)) * 100).toFixed(1)}%)`);
    console.log(`ユニークタグ数: ${stats.unique_tags}個`);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

generateTagsForQiita().catch(console.error);
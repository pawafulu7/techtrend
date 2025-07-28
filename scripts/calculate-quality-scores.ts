import { PrismaClient } from '@prisma/client';
import { calculateQualityScore, checkCategoryQuality } from '@/lib/utils/quality-score';

const prisma = new PrismaClient();

async function calculateAllQualityScores() {
  console.log('📊 品質スコアの計算を開始します...\n');

  try {
    // すべての記事を取得
    const articles = await prisma.article.findMany({
      include: {
        source: true,
        tags: true,
      },
    });

    console.log(`📄 処理対象の記事数: ${articles.length}件`);

    let processedCount = 0;
    const batchSize = 100;
    
    // バッチ処理で更新
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (article) => {
          const baseScore = calculateQualityScore(article);
          const { qualityBonus } = checkCategoryQuality(article);
          const finalScore = Math.min(100, baseScore + qualityBonus);
          
          await prisma.article.update({
            where: { id: article.id },
            data: { qualityScore: finalScore },
          });
          
          processedCount++;
        })
      );
      
      console.log(`✓ 処理済み: ${processedCount}/${articles.length}件`);
    }

    // スコア分布を表示
    const scoreDistribution = await prisma.$queryRaw`
      SELECT 
        CASE 
          WHEN qualityScore >= 80 THEN '80-100 (優秀)'
          WHEN qualityScore >= 60 THEN '60-79 (良好)'
          WHEN qualityScore >= 40 THEN '40-59 (普通)'
          WHEN qualityScore >= 20 THEN '20-39 (低)'
          ELSE '0-19 (非常に低い)'
        END as range,
        COUNT(*) as count
      FROM Article
      GROUP BY range
      ORDER BY MIN(qualityScore) DESC
    ` as { range: string; count: bigint }[];

    console.log('\n【品質スコア分布】');
    scoreDistribution.forEach(dist => {
      console.log(`${dist.range}: ${Number(dist.count)}件`);
    });

    // 上位10記事を表示
    const topArticles = await prisma.article.findMany({
      take: 10,
      orderBy: { qualityScore: 'desc' },
      include: { source: true },
    });

    console.log('\n【品質スコア上位10記事】');
    topArticles.forEach((article, index) => {
      console.log(`${index + 1}. [${article.source.name}] ${article.title.substring(0, 50)}... (スコア: ${article.qualityScore})`);
    });

    console.log('\n✅ 品質スコアの計算が完了しました');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

calculateAllQualityScores().catch(console.error);
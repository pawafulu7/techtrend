import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SummaryStats {
  source: string;
  count: number;
  avgSummaryLength: number;
  minSummaryLength: number;
  maxSummaryLength: number;
  avgDetailedSummaryLength: number;
  minDetailedSummaryLength: number;
  maxDetailedSummaryLength: number;
  summaryInRange: number; // 100-120文字の範囲内
  summaryTooShort: number; // 100文字未満
  summaryTooLong: number; // 120文字超
}

interface QualitySample {
  title: string;
  source: string;
  summaryLength: number;
  summary: string;
  detailedSummaryLength: number;
  detailedSummaryPreview: string;
}

// 文字数の統計情報を計算
function calculateStats(articles: any[]): SummaryStats[] {
  const statsBySource = new Map<string, any[]>();
  
  // ソース別にグループ化
  for (const article of articles) {
    const sourceName = article.source.name;
    if (!statsBySource.has(sourceName)) {
      statsBySource.set(sourceName, []);
    }
    statsBySource.get(sourceName)!.push(article);
  }
  
  // 統計情報を計算
  const stats: SummaryStats[] = [];
  
  for (const [sourceName, sourceArticles] of statsBySource) {
    const summaryLengths = sourceArticles
      .filter(a => a.summary)
      .map(a => a.summary.length);
    
    const detailedSummaryLengths = sourceArticles
      .filter(a => a.detailedSummary)
      .map(a => a.detailedSummary.length);
    
    if (summaryLengths.length === 0) continue;
    
    const summaryInRange = summaryLengths.filter(len => len >= 100 && len <= 120).length;
    const summaryTooShort = summaryLengths.filter(len => len < 100).length;
    const summaryTooLong = summaryLengths.filter(len => len > 120).length;
    
    stats.push({
      source: sourceName,
      count: sourceArticles.length,
      avgSummaryLength: Math.round(summaryLengths.reduce((a, b) => a + b, 0) / summaryLengths.length),
      minSummaryLength: Math.min(...summaryLengths),
      maxSummaryLength: Math.max(...summaryLengths),
      avgDetailedSummaryLength: detailedSummaryLengths.length > 0
        ? Math.round(detailedSummaryLengths.reduce((a, b) => a + b, 0) / detailedSummaryLengths.length)
        : 0,
      minDetailedSummaryLength: detailedSummaryLengths.length > 0
        ? Math.min(...detailedSummaryLengths)
        : 0,
      maxDetailedSummaryLength: detailedSummaryLengths.length > 0
        ? Math.max(...detailedSummaryLengths)
        : 0,
      summaryInRange,
      summaryTooShort,
      summaryTooLong
    });
  }
  
  return stats.sort((a, b) => b.count - a.count);
}

// 差別化チェック
function checkDifferentiation(article: any): {
  isDifferentiated: boolean;
  overlapRatio: number;
  summaryFocus: string;
  detailedFocus: string;
} {
  if (!article.summary || !article.detailedSummary) {
    return {
      isDifferentiated: false,
      overlapRatio: 0,
      summaryFocus: 'N/A',
      detailedFocus: 'N/A'
    };
  }
  
  const summary = article.summary.toLowerCase();
  const detailedSummary = article.detailedSummary.toLowerCase();
  
  // 単語の重複をチェック
  const summaryWords = summary.split(/\s+/).filter(w => w.length > 2);
  const detailedWords = detailedSummary.split(/\s+/).filter(w => w.length > 2);
  
  const commonWords = summaryWords.filter(word => detailedWords.includes(word));
  const overlapRatio = commonWords.length / summaryWords.length;
  
  // フォーカスの判定
  const summaryFocus = summary.includes('問題') && summary.includes('解決') ? '問題解決型' : '概要説明型';
  const detailedFocus = detailedSummary.includes('実装') || detailedSummary.includes('コード') ? '技術詳細型' : '説明型';
  
  return {
    isDifferentiated: overlapRatio < 0.5 && summaryFocus !== detailedFocus,
    overlapRatio: Math.round(overlapRatio * 100),
    summaryFocus,
    detailedFocus
  };
}

// サンプル記事の取得
async function getSamples(limit: number = 5): Promise<QualitySample[]> {
  const articles = await prisma.article.findMany({
    where: {
      summary: { not: null },
      detailedSummary: { not: null }
    },
    include: { source: true },
    orderBy: { publishedAt: 'desc' },
    take: limit
  });
  
  return articles.map(article => ({
    title: article.title,
    source: article.source.name,
    summaryLength: article.summary!.length,
    summary: article.summary!,
    detailedSummaryLength: article.detailedSummary!.length,
    detailedSummaryPreview: article.detailedSummary!.substring(0, 200) + '...'
  }));
}

// メイン処理
async function checkSummaryQuality() {
  console.log('📊 要約品質チェックを開始します...\n');
  
  try {
    // 全記事を取得
    const articles = await prisma.article.findMany({
      where: {
        summary: { not: null }
      },
      include: { source: true }
    });
    
    console.log(`📄 分析対象: ${articles.length}件の記事\n`);
    
    // 1. 文字数統計
    console.log('【文字数統計】');
    console.log('=' .repeat(80));
    
    const stats = calculateStats(articles);
    
    console.log('ソース別統計:');
    for (const stat of stats) {
      console.log(`\n${stat.source} (${stat.count}件)`);
      console.log(`  一覧要約: 平均${stat.avgSummaryLength}文字 (最小${stat.minSummaryLength} - 最大${stat.maxSummaryLength})`);
      console.log(`    - 適正範囲(100-120): ${stat.summaryInRange}件 (${Math.round(stat.summaryInRange / stat.count * 100)}%)`);
      console.log(`    - 短すぎ(<100): ${stat.summaryTooShort}件 (${Math.round(stat.summaryTooShort / stat.count * 100)}%)`);
      console.log(`    - 長すぎ(>120): ${stat.summaryTooLong}件 (${Math.round(stat.summaryTooLong / stat.count * 100)}%)`);
      console.log(`  詳細要約: 平均${stat.avgDetailedSummaryLength}文字 (最小${stat.minDetailedSummaryLength} - 最大${stat.maxDetailedSummaryLength})`);
    }
    
    // 2. 全体統計
    console.log('\n' + '=' .repeat(80));
    console.log('【全体統計】');
    
    const allSummaryLengths = articles
      .filter(a => a.summary)
      .map(a => a.summary!.length);
    
    const totalInRange = allSummaryLengths.filter(len => len >= 100 && len <= 120).length;
    const totalTooShort = allSummaryLengths.filter(len => len < 100).length;
    const totalTooLong = allSummaryLengths.filter(len => len > 120).length;
    
    console.log(`\n一覧要約の文字数分布:`);
    console.log(`  適正範囲(100-120文字): ${totalInRange}件 (${Math.round(totalInRange / articles.length * 100)}%)`);
    console.log(`  短すぎ(<100文字): ${totalTooShort}件 (${Math.round(totalTooShort / articles.length * 100)}%)`);
    console.log(`  長すぎ(>120文字): ${totalTooLong}件 (${Math.round(totalTooLong / articles.length * 100)}%)`);
    
    // 3. 差別化チェック
    console.log('\n' + '=' .repeat(80));
    console.log('【差別化チェック】');
    
    const recentArticles = articles
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, 20);
    
    let differentiatedCount = 0;
    
    for (const article of recentArticles) {
      const check = checkDifferentiation(article);
      if (check.isDifferentiated) differentiatedCount++;
    }
    
    console.log(`\n最新20件の差別化状況:`);
    console.log(`  差別化できている: ${differentiatedCount}件 (${Math.round(differentiatedCount / 20 * 100)}%)`);
    console.log(`  差別化不十分: ${20 - differentiatedCount}件 (${Math.round((20 - differentiatedCount) / 20 * 100)}%)`);
    
    // 4. サンプル表示
    console.log('\n' + '=' .repeat(80));
    console.log('【最新記事のサンプル】');
    
    const samples = await getSamples(3);
    
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const article = recentArticles[i];
      const check = checkDifferentiation(article);
      
      console.log(`\n[${i + 1}] ${sample.title}`);
      console.log(`ソース: ${sample.source}`);
      console.log(`\n一覧要約 (${sample.summaryLength}文字):`);
      console.log(`  ${sample.summary}`);
      console.log(`\n詳細要約 (${sample.detailedSummaryLength}文字):`);
      console.log(`  ${sample.detailedSummaryPreview}`);
      console.log(`\n差別化分析:`);
      console.log(`  - 単語重複率: ${check.overlapRatio}%`);
      console.log(`  - 一覧フォーカス: ${check.summaryFocus}`);
      console.log(`  - 詳細フォーカス: ${check.detailedFocus}`);
      console.log(`  - 判定: ${check.isDifferentiated ? '✅ 差別化できている' : '❌ 差別化不十分'}`);
    }
    
    // 5. 改善提案
    console.log('\n' + '=' .repeat(80));
    console.log('【改善提案】');
    
    if (totalTooLong / articles.length > 0.3) {
      console.log('\n⚠️  一覧要約が長すぎる記事が多いです（30%以上）');
      console.log('   → プロンプトの文字数制限をより厳格にする必要があります');
    }
    
    if (differentiatedCount / 20 < 0.7) {
      console.log('\n⚠️  一覧と詳細の差別化が不十分です（70%未満）');
      console.log('   → 詳細要約でより技術的な深掘りが必要です');
    }
    
    console.log('\n✅ 品質チェック完了');
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// コマンドライン実行
if (require.main === module) {
  checkSummaryQuality()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { checkSummaryQuality };
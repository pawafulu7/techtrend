import { PrismaClient } from '@prisma/client';
import { checkContentQuality } from '@/lib/utils/content-quality-checker';

const prisma = new PrismaClient();

async function checkSummaryQuality() {
  console.log('📊 要約品質チェックを開始します...\n');
  
  try {
    // すべての要約を取得（最新100件）
    const articles = await prisma.article.findMany({
      where: {
        summary: { not: null }
      },
      include: {
        source: true
      },
      orderBy: {
        publishedAt: 'desc'
      },
      take: 100
    });
    
    const stats = {
      total: articles.length,
      valid: 0,
      needsRegeneration: 0,
      issues: {
        length: 0,
        truncation: 0,
        thinContent: 0,
        languageMix: 0,
        format: 0
      },
      scoreDistribution: {
        excellent: 0,  // 90-100
        good: 0,       // 80-89
        fair: 0,       // 70-79
        poor: 0        // < 70
      }
    };
    
    console.log(`検査対象: ${articles.length}件の記事\n`);
    console.log('問題のある要約:');
    console.log('=' .repeat(80));
    
    for (const article of articles) {
      const result = checkContentQuality(
        article.summary || '',
        article.detailedSummary || undefined,
        article.title
      );
      
      if (result.isValid) {
        stats.valid++;
      }
      
      if (result.requiresRegeneration) {
        stats.needsRegeneration++;
        console.log(`\n📝 [${article.source.name}] ${article.title.substring(0, 50)}...`);
        console.log(`   スコア: ${result.score}/100`);
        console.log(`   問題:`);
        result.issues.forEach(issue => {
          console.log(`   - [${issue.severity}] ${issue.type}: ${issue.description}`);
          if (issue.suggestion) {
            console.log(`     → ${issue.suggestion}`);
          }
        });
        console.log(`   要約: "${article.summary?.substring(0, 100)}..."`);
      }
      
      // 問題タイプをカウント
      result.issues.forEach(issue => {
        if (issue.type === 'length') stats.issues.length++;
        if (issue.type === 'truncation') stats.issues.truncation++;
        if (issue.type === 'thin_content') stats.issues.thinContent++;
        if (issue.type === 'language_mix') stats.issues.languageMix++;
        if (issue.type === 'format') stats.issues.format++;
      });
      
      // スコア分布
      if (result.score >= 90) stats.scoreDistribution.excellent++;
      else if (result.score >= 80) stats.scoreDistribution.good++;
      else if (result.score >= 70) stats.scoreDistribution.fair++;
      else stats.scoreDistribution.poor++;
    }
    
    // 統計サマリー
    console.log('\n' + '=' .repeat(80));
    console.log('\n📈 品質統計サマリー:');
    console.log(`   検査記事数: ${stats.total}件`);
    console.log(`   有効な要約: ${stats.valid}件 (${Math.round(stats.valid / stats.total * 100)}%)`);
    console.log(`   再生成必要: ${stats.needsRegeneration}件 (${Math.round(stats.needsRegeneration / stats.total * 100)}%)`);
    
    console.log('\n📊 スコア分布:');
    console.log(`   優秀 (90-100): ${stats.scoreDistribution.excellent}件 (${Math.round(stats.scoreDistribution.excellent / stats.total * 100)}%)`);
    console.log(`   良好 (80-89):  ${stats.scoreDistribution.good}件 (${Math.round(stats.scoreDistribution.good / stats.total * 100)}%)`);
    console.log(`   普通 (70-79):  ${stats.scoreDistribution.fair}件 (${Math.round(stats.scoreDistribution.fair / stats.total * 100)}%)`);
    console.log(`   要改善 (<70):  ${stats.scoreDistribution.poor}件 (${Math.round(stats.scoreDistribution.poor / stats.total * 100)}%)`);
    
    console.log('\n🔍 問題タイプ別集計:');
    console.log(`   文字数問題:   ${stats.issues.length}件`);
    console.log(`   途切れ:       ${stats.issues.truncation}件`);
    console.log(`   内容薄い:     ${stats.issues.thinContent}件`);
    console.log(`   英語混入:     ${stats.issues.languageMix}件`);
    console.log(`   形式問題:     ${stats.issues.format}件`);
    
    // 改善提案
    if (stats.needsRegeneration > 0) {
      console.log('\n💡 改善提案:');
      console.log(`   ${stats.needsRegeneration}件の記事で要約の再生成が推奨されます。`);
      console.log('   以下のコマンドで再生成を実行できます:');
      console.log('   npm run scripts:summarize');
    }
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行
if (require.main === module) {
  checkSummaryQuality()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
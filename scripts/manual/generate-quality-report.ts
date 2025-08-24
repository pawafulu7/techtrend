import { PrismaClient } from '@prisma/client';
import { checkContentQuality } from '@/lib/utils/content-quality-checker';
import { techTermsManager } from '@/lib/utils/tech-terms-manager';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

interface QualityMetrics {
  totalArticles: number;
  averageScore: number;
  scoreDistribution: {
    excellent: number;  // 90-100
    good: number;       // 80-89
    fair: number;       // 70-79
    poor: number;       // < 70
  };
  issueTypes: {
    length: number;
    truncation: number;
    thinContent: number;
    languageMix: number;
    format: number;
  };
  regenerationStats: {
    needed: number;
    successful: number;
    failed: number;
  };
  techTermsUsage: {
    totalTermsUsed: number;
    uniqueTermsUsed: number;
    topTerms: Array<{ term: string; count: number }>;
  };
  sourceBreakdown: Map<string, {
    total: number;
    averageScore: number;
    issues: number;
  }>;
}

async function generateQualityReport() {
  console.error('📊 品質レポート生成を開始します...\n');
  
  const startTime = Date.now();
  
  try {
    // 技術用語辞書を初期化
    await techTermsManager.loadCustomTerms();
    
    // すべての要約を取得
    const articles = await prisma.article.findMany({
      where: {
        summary: { not: null }
      },
      include: {
        source: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });
    
    const metrics: QualityMetrics = {
      totalArticles: articles.length,
      averageScore: 0,
      scoreDistribution: {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0
      },
      issueTypes: {
        length: 0,
        truncation: 0,
        thinContent: 0,
        languageMix: 0,
        format: 0
      },
      regenerationStats: {
        needed: 0,
        successful: 0,
        failed: 0
      },
      techTermsUsage: {
        totalTermsUsed: 0,
        uniqueTermsUsed: 0,
        topTerms: []
      },
      sourceBreakdown: new Map()
    };
    
    let totalScore = 0;
    const termUsageMap = new Map<string, number>();
    
    // 各記事の品質をチェック
    for (const article of articles) {
      const result = checkContentQuality(
        article.summary || '',
        article.detailedSummary || undefined,
        article.title
      );
      
      totalScore += result.score;
      
      // スコア分布
      if (result.score >= 90) metrics.scoreDistribution.excellent++;
      else if (result.score >= 80) metrics.scoreDistribution.good++;
      else if (result.score >= 70) metrics.scoreDistribution.fair++;
      else metrics.scoreDistribution.poor++;
      
      // 問題タイプの集計
      result.issues.forEach(issue => {
        if (issue.type === 'length') metrics.issueTypes.length++;
        if (issue.type === 'truncation') metrics.issueTypes.truncation++;
        if (issue.type === 'thin_content') metrics.issueTypes.thinContent++;
        if (issue.type === 'language_mix') {
          metrics.issueTypes.languageMix++;
          // 英語混入の詳細を記録
          if (issue.details) {
            const details = issue.details as any;
            if (details.allowedTerms) {
              details.allowedTerms.forEach((term: string) => {
                const count = termUsageMap.get(term) || 0;
                termUsageMap.set(term, count + 1);
                techTermsManager.recordUsage(term);
              });
            }
          }
        }
        if (issue.type === 'format') metrics.issueTypes.format++;
      });
      
      // 再生成が必要かどうか
      if (result.requiresRegeneration) {
        metrics.regenerationStats.needed++;
      }
      
      // ソース別の統計
      const sourceName = article.source.name;
      const sourceStats = metrics.sourceBreakdown.get(sourceName) || {
        total: 0,
        averageScore: 0,
        issues: 0
      };
      
      sourceStats.total++;
      sourceStats.averageScore = ((sourceStats.averageScore * (sourceStats.total - 1)) + result.score) / sourceStats.total;
      if (result.issues.length > 0) sourceStats.issues++;
      
      metrics.sourceBreakdown.set(sourceName, sourceStats);
    }
    
    // 平均スコアを計算
    metrics.averageScore = Math.round(totalScore / metrics.totalArticles);
    
    // 技術用語の使用統計
    metrics.techTermsUsage.totalTermsUsed = Array.from(termUsageMap.values()).reduce((a, b) => a + b, 0);
    metrics.techTermsUsage.uniqueTermsUsed = termUsageMap.size;
    metrics.techTermsUsage.topTerms = Array.from(termUsageMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term, count]) => ({ term, count }));
    
    // レポートを表示
    console.error('=' .repeat(80));
    console.error('📊 要約品質レポート');
    console.error('=' .repeat(80));
    
    console.error(`\n📈 全体統計:`);
    console.error(`   総記事数: ${metrics.totalArticles}件`);
    console.error(`   平均スコア: ${metrics.averageScore}/100`);
    
    console.error(`\n📊 スコア分布:`);
    console.error(`   優秀 (90-100): ${metrics.scoreDistribution.excellent}件 (${Math.round(metrics.scoreDistribution.excellent / metrics.totalArticles * 100)}%)`);
    console.error(`   良好 (80-89):  ${metrics.scoreDistribution.good}件 (${Math.round(metrics.scoreDistribution.good / metrics.totalArticles * 100)}%)`);
    console.error(`   普通 (70-79):  ${metrics.scoreDistribution.fair}件 (${Math.round(metrics.scoreDistribution.fair / metrics.totalArticles * 100)}%)`);
    console.error(`   要改善 (<70):  ${metrics.scoreDistribution.poor}件 (${Math.round(metrics.scoreDistribution.poor / metrics.totalArticles * 100)}%)`);
    
    console.error(`\n🔍 問題タイプ別集計:`);
    console.error(`   文字数問題:   ${metrics.issueTypes.length}件`);
    console.error(`   途切れ:       ${metrics.issueTypes.truncation}件`);
    console.error(`   内容薄い:     ${metrics.issueTypes.thinContent}件`);
    console.error(`   英語混入:     ${metrics.issueTypes.languageMix}件`);
    console.error(`   形式問題:     ${metrics.issueTypes.format}件`);
    
    console.error(`\n🔄 再生成統計:`);
    console.error(`   再生成必要:   ${metrics.regenerationStats.needed}件`);
    
    console.error(`\n📝 技術用語使用統計:`);
    console.error(`   総使用回数:   ${metrics.techTermsUsage.totalTermsUsed}回`);
    console.error(`   ユニーク用語: ${metrics.techTermsUsage.uniqueTermsUsed}種類`);
    
    if (metrics.techTermsUsage.topTerms.length > 0) {
      console.error(`\n   頻出技術用語TOP10:`);
      metrics.techTermsUsage.topTerms.forEach((item, index) => {
        console.error(`   ${index + 1}. ${item.term}: ${item.count}回`);
      });
    }
    
    console.error(`\n📰 ソース別統計:`);
    const sortedSources = Array.from(metrics.sourceBreakdown.entries())
      .sort((a, b) => b[1].averageScore - a[1].averageScore);
    
    sortedSources.forEach(([source, stats]) => {
      console.error(`   ${source}:`);
      console.error(`     - 記事数: ${stats.total}件`);
      console.error(`     - 平均スコア: ${Math.round(stats.averageScore)}/100`);
      console.error(`     - 問題あり: ${stats.issues}件 (${Math.round(stats.issues / stats.total * 100)}%)`);
    });
    
    // レポートをファイルに保存
    const reportDir = path.join(process.cwd(), 'reports');
    await fs.mkdir(reportDir, { recursive: true });
    
    const reportPath = path.join(
      reportDir,
      `quality-report-${new Date().toISOString().split('T')[0]}.json`
    );
    
    await fs.writeFile(
      reportPath,
      JSON.stringify({
        generatedAt: new Date(),
        metrics,
        sourceBreakdown: Object.fromEntries(metrics.sourceBreakdown)
      }, null, 2)
    );
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`\n✅ レポート生成完了 (処理時間: ${duration}秒)`);
    console.error(`📁 レポートファイル: ${reportPath}`);
    
    // 改善提案
    console.error('\n' + '=' .repeat(80));
    console.error('💡 改善提案:');
    
    if (metrics.scoreDistribution.poor > metrics.totalArticles * 0.1) {
      console.error('⚠️  10%以上の記事が低品質です。要約生成ロジックの見直しを推奨します。');
    }
    
    if (metrics.issueTypes.truncation > metrics.totalArticles * 0.05) {
      console.error('⚠️  5%以上の記事で途切れが発生しています。APIレスポンス処理の確認を推奨します。');
    }
    
    if (metrics.issueTypes.languageMix > metrics.totalArticles * 0.02) {
      console.error('⚠️  英語混入が多く検出されています。プロンプトの日本語指示を強化してください。');
    }
    
    if (metrics.averageScore < 85) {
      console.error('⚠️  平均スコアが目標の85点を下回っています。品質改善が必要です。');
    } else if (metrics.averageScore >= 90) {
      console.error('✨ 優秀な品質を維持しています！');
    }
    
  } catch (error) {
    console.error('❌ レポート生成エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行
if (require.main === module) {
  generateQualityReport()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
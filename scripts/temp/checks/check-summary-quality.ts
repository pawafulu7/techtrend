/**
 * Phase 4: 品質チェックスクリプト
 * 全要約の品質をスコアリングし、詳細な分析レポートを生成
 */

import { PrismaClient } from '@prisma/client';
import { 
  validateSummary,
  validateByArticleType
} from '../../lib/utils/summary-validator';
import { detectArticleType } from '../../lib/utils/article-type-detector';
import { calculateSummaryScore } from '../../lib/utils/quality-scorer';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// コマンドライン引数の処理
const args = process.argv.slice(2);
const outputFormat = args.includes('--json') ? 'json' : 'markdown';
const includeSources = args.find(arg => arg.startsWith('--sources='))?.split('=')[1]?.split(',');
const sinceDate = args.find(arg => arg.startsWith('--since='))?.split('=')[1];
const outputFile = args.find(arg => arg.startsWith('--output='))?.split('=')[1];

interface QualityAnalysis {
  totalArticles: number;
  articlesWithSummary: number;
  validSummaries: number;
  invalidSummaries: number;
  averageLength: number;
  lengthDistribution: Map<string, number>;
  sourceAnalysis: Map<string, SourceStats>;
  articleTypeAnalysis: Map<string, TypeStats>;
  commonIssues: Map<string, number>;
  qualityScores: {
    excellent: number;  // 90-100
    good: number;       // 70-89
    fair: number;       // 50-69
    poor: number;       // 0-49
  };
  recommendations: string[];
}

interface SourceStats {
  count: number;
  validCount: number;
  averageLength: number;
  averageScore: number;
  commonIssues: string[];
}

interface TypeStats {
  count: number;
  validCount: number;
  averageLength: number;
  averageScore: number;
}

async function checkSummaryQuality() {
  console.error('===== Phase 4: 要約品質チェック =====\n');
  
  // クエリ条件の構築
  const whereClause: any = {};
  
  if (includeSources && includeSources.length > 0) {
    whereClause.source = {
      name: {
        in: includeSources
      }
    };
  }
  
  if (sinceDate) {
    whereClause.publishedAt = {
      gte: new Date(sinceDate)
    };
  }
  
  // 記事の取得
  console.error('📊 記事データを取得中...');
  
  const articles = await prisma.article.findMany({
    where: whereClause,
    include: {
      source: true,
      tags: true
    },
    orderBy: {
      publishedAt: 'desc'
    }
  });
  
  console.error(`  取得記事数: ${articles.length}件\n`);
  
  // 分析の初期化
  const analysis: QualityAnalysis = {
    totalArticles: articles.length,
    articlesWithSummary: 0,
    validSummaries: 0,
    invalidSummaries: 0,
    averageLength: 0,
    lengthDistribution: new Map(),
    sourceAnalysis: new Map(),
    articleTypeAnalysis: new Map(),
    commonIssues: new Map(),
    qualityScores: {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0
    },
    recommendations: []
  };
  
  // 記事ごとの分析
  console.error('🔍 要約品質を分析中...\n');
  
  let totalLength = 0;
  let processedCount = 0;
  
  for (const article of articles) {
    processedCount++;
    
    // 進捗表示
    if (processedCount % 100 === 0) {
      const progress = Math.round((processedCount / articles.length) * 100);
      console.error(`  進捗: ${progress}% (${processedCount}/${articles.length})`);
    }
    
    if (!article.summary) {
      continue;
    }
    
    analysis.articlesWithSummary++;
    
    // 基本検証
    const validation = validateSummary(article.summary);
    
    if (validation.isValid) {
      analysis.validSummaries++;
    } else {
      analysis.invalidSummaries++;
      
      // エラーの集計
      for (const error of validation.errors) {
        const key = error.split('（')[0].trim(); // エラーメッセージの主要部分を抽出
        analysis.commonIssues.set(key, (analysis.commonIssues.get(key) || 0) + 1);
      }
    }
    
    // 文字数の集計
    const summaryLength = article.summary.length;
    totalLength += summaryLength;
    
    // 文字数分布
    const lengthBucket = getLengthBucket(summaryLength);
    analysis.lengthDistribution.set(lengthBucket, (analysis.lengthDistribution.get(lengthBucket) || 0) + 1);
    
    // 品質スコアの計算
    const score = calculateSummaryScore(article.summary, {
      tags: article.tags.map(t => t.name)
    });
    
    if (score.totalScore >= 90) {
      analysis.qualityScores.excellent++;
    } else if (score.totalScore >= 70) {
      analysis.qualityScores.good++;
    } else if (score.totalScore >= 50) {
      analysis.qualityScores.fair++;
    } else {
      analysis.qualityScores.poor++;
    }
    
    // ソース別分析
    const sourceName = article.source.name;
    if (!analysis.sourceAnalysis.has(sourceName)) {
      analysis.sourceAnalysis.set(sourceName, {
        count: 0,
        validCount: 0,
        averageLength: 0,
        averageScore: 0,
        commonIssues: []
      });
    }
    
    const sourceStats = analysis.sourceAnalysis.get(sourceName)!;
    sourceStats.count++;
    if (validation.isValid) sourceStats.validCount++;
    sourceStats.averageLength = ((sourceStats.averageLength * (sourceStats.count - 1)) + summaryLength) / sourceStats.count;
    sourceStats.averageScore = ((sourceStats.averageScore * (sourceStats.count - 1)) + score.totalScore) / sourceStats.count;
    
    // 記事タイプ別分析
    const content = article.content || article.summary;
    const articleType = detectArticleType(article.title, content);
    
    if (!analysis.articleTypeAnalysis.has(articleType)) {
      analysis.articleTypeAnalysis.set(articleType, {
        count: 0,
        validCount: 0,
        averageLength: 0,
        averageScore: 0
      });
    }
    
    const typeStats = analysis.articleTypeAnalysis.get(articleType)!;
    typeStats.count++;
    if (validation.isValid) typeStats.validCount++;
    typeStats.averageLength = ((typeStats.averageLength * (typeStats.count - 1)) + summaryLength) / typeStats.count;
    typeStats.averageScore = ((typeStats.averageScore * (typeStats.count - 1)) + score.totalScore) / typeStats.count;
  }
  
  // 平均文字数の計算
  if (analysis.articlesWithSummary > 0) {
    analysis.averageLength = Math.round(totalLength / analysis.articlesWithSummary);
  }
  
  // 推奨事項の生成
  generateRecommendations(analysis);
  
  // レポートの出力
  console.error('\n\n===== 品質分析レポート =====\n');
  
  if (outputFormat === 'markdown') {
    outputMarkdownReport(analysis);
  } else {
    outputJsonReport(analysis);
  }
  
  // ファイル出力
  if (outputFile) {
    const reportContent = outputFormat === 'markdown' 
      ? generateMarkdownReport(analysis)
      : JSON.stringify(analysis, null, 2);
    
    const outputPath = path.resolve(outputFile);
    fs.writeFileSync(outputPath, reportContent);
    console.error(`\n📝 レポート保存: ${outputPath}`);
  }
  
  await prisma.$disconnect();
  
  console.error('\n===== 品質チェック完了 =====');
}

function getLengthBucket(length: number): string {
  if (length < 50) return '0-49';
  if (length < 70) return '50-69';
  if (length < 90) return '70-89';
  if (length < 110) return '90-109';
  if (length < 130) return '110-129';
  if (length < 150) return '130-149';
  return '150+';
}

function generateRecommendations(analysis: QualityAnalysis) {
  const validRate = (analysis.validSummaries / analysis.articlesWithSummary) * 100;
  
  if (validRate < 50) {
    analysis.recommendations.push('⚠️ 要約の半数以上が品質基準を満たしていません。包括的な改善が必要です。');
  }
  
  if (analysis.averageLength < 90) {
    analysis.recommendations.push('📏 平均文字数が90文字未満です。より詳細な要約の生成を推奨します。');
  }
  
  if (analysis.averageLength > 130) {
    analysis.recommendations.push('📏 平均文字数が130文字を超えています。簡潔な要約への調整を推奨します。');
  }
  
  // 最も問題の多いソースを特定
  let worstSource: string | null = null;
  let worstValidRate = 100;
  
  for (const [source, stats] of analysis.sourceAnalysis) {
    const validRate = (stats.validCount / stats.count) * 100;
    if (validRate < worstValidRate) {
      worstValidRate = validRate;
      worstSource = source;
    }
  }
  
  if (worstSource && worstValidRate < 30) {
    analysis.recommendations.push(`🎯 ${worstSource}の要約品質が特に低い（${Math.round(worstValidRate)}%）です。優先的な改善を推奨します。`);
  }
  
  // 最も多い問題を特定
  const topIssues = Array.from(analysis.commonIssues.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  
  if (topIssues.length > 0) {
    analysis.recommendations.push(`🔧 主な問題: ${topIssues.map(([issue]) => issue).join('、')}`);
  }
  
  // 品質スコアの分布から推奨
  const excellentRate = (analysis.qualityScores.excellent / analysis.articlesWithSummary) * 100;
  const poorRate = (analysis.qualityScores.poor / analysis.articlesWithSummary) * 100;
  
  if (excellentRate < 10) {
    analysis.recommendations.push('⭐ 高品質（90点以上）の要約が少ないです。品質向上の余地があります。');
  }
  
  if (poorRate > 30) {
    analysis.recommendations.push('❌ 低品質（50点未満）の要約が30%を超えています。再生成を検討してください。');
  }
}

function outputMarkdownReport(analysis: QualityAnalysis) {
  console.error('## 📊 基本統計\n');
  console.error(`- 総記事数: ${analysis.totalArticles}件`);
  console.error(`- 要約あり: ${analysis.articlesWithSummary}件 (${Math.round((analysis.articlesWithSummary / analysis.totalArticles) * 100)}%)`);
  console.error(`- 有効な要約: ${analysis.validSummaries}件 (${Math.round((analysis.validSummaries / analysis.articlesWithSummary) * 100)}%)`);
  console.error(`- 無効な要約: ${analysis.invalidSummaries}件 (${Math.round((analysis.invalidSummaries / analysis.articlesWithSummary) * 100)}%)`);
  console.error(`- 平均文字数: ${analysis.averageLength}文字`);
  
  console.error('\n## 📈 文字数分布\n');
  const sortedDistribution = Array.from(analysis.lengthDistribution.entries()).sort();
  for (const [bucket, count] of sortedDistribution) {
    const percentage = Math.round((count / analysis.articlesWithSummary) * 100);
    const bar = '█'.repeat(Math.round(percentage / 2));
    console.error(`${bucket.padEnd(10)} ${bar} ${count}件 (${percentage}%)`);
  }
  
  console.error('\n## ⭐ 品質スコア分布\n');
  console.error(`- 優秀 (90-100): ${analysis.qualityScores.excellent}件 (${Math.round((analysis.qualityScores.excellent / analysis.articlesWithSummary) * 100)}%)`);
  console.error(`- 良好 (70-89): ${analysis.qualityScores.good}件 (${Math.round((analysis.qualityScores.good / analysis.articlesWithSummary) * 100)}%)`);
  console.error(`- 可 (50-69): ${analysis.qualityScores.fair}件 (${Math.round((analysis.qualityScores.fair / analysis.articlesWithSummary) * 100)}%)`);
  console.error(`- 要改善 (0-49): ${analysis.qualityScores.poor}件 (${Math.round((analysis.qualityScores.poor / analysis.articlesWithSummary) * 100)}%)`);
  
  console.error('\n## 📰 ソース別分析\n');
  const sortedSources = Array.from(analysis.sourceAnalysis.entries())
    .sort((a, b) => b[1].count - a[1].count);
  
  for (const [source, stats] of sortedSources) {
    const validRate = Math.round((stats.validCount / stats.count) * 100);
    const status = validRate >= 80 ? '✅' : validRate >= 50 ? '⚠️' : '❌';
    console.error(`### ${status} ${source}`);
    console.error(`  - 記事数: ${stats.count}件`);
    console.error(`  - 有効率: ${validRate}%`);
    console.error(`  - 平均文字数: ${Math.round(stats.averageLength)}文字`);
    console.error(`  - 平均スコア: ${Math.round(stats.averageScore)}点`);
  }
  
  console.error('\n## 🏷️ 記事タイプ別分析\n');
  for (const [type, stats] of analysis.articleTypeAnalysis) {
    const validRate = Math.round((stats.validCount / stats.count) * 100);
    console.error(`### ${type}`);
    console.error(`  - 記事数: ${stats.count}件`);
    console.error(`  - 有効率: ${validRate}%`);
    console.error(`  - 平均文字数: ${Math.round(stats.averageLength)}文字`);
    console.error(`  - 平均スコア: ${Math.round(stats.averageScore)}点`);
  }
  
  if (analysis.commonIssues.size > 0) {
    console.error('\n## ⚠️ よくある問題\n');
    const sortedIssues = Array.from(analysis.commonIssues.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    for (const [issue, count] of sortedIssues) {
      console.error(`- ${issue}: ${count}件`);
    }
  }
  
  if (analysis.recommendations.length > 0) {
    console.error('\n## 💡 推奨事項\n');
    for (const recommendation of analysis.recommendations) {
      console.error(`- ${recommendation}`);
    }
  }
}

function generateMarkdownReport(analysis: QualityAnalysis): string {
  let report = '# 要約品質分析レポート\n\n';
  report += `生成日時: ${new Date().toISOString()}\n\n`;
  
  // 以下、outputMarkdownReportと同様の内容を文字列として構築
  // （詳細は省略）
  
  return report;
}

function outputJsonReport(analysis: QualityAnalysis) {
  // MapをObjectに変換
  const jsonAnalysis = {
    ...analysis,
    lengthDistribution: Object.fromEntries(analysis.lengthDistribution),
    sourceAnalysis: Object.fromEntries(analysis.sourceAnalysis),
    articleTypeAnalysis: Object.fromEntries(analysis.articleTypeAnalysis),
    commonIssues: Object.fromEntries(analysis.commonIssues)
  };
  
  console.error(JSON.stringify(jsonAnalysis, null, 2));
}

// 使用方法の表示
if (args.includes('--help')) {
  console.error(`
使用方法:
  npx tsx scripts/check-summary-quality.ts [オプション]

オプション:
  --sources=NAME1,NAME2  特定のソースのみを分析
  --since=YYYY-MM-DD     指定日以降の記事のみを分析
  --output=FILE          レポートをファイルに保存
  --json                 JSON形式で出力
  --help                 このヘルプを表示

例:
  npx tsx scripts/check-summary-quality.ts
  npx tsx scripts/check-summary-quality.ts --sources=Zenn,Dev.to --json
  npx tsx scripts/check-summary-quality.ts --since=2024-01-01 --output=report.md
  `);
  process.exit(0);
}

// スクリプト実行
checkSummaryQuality().catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});
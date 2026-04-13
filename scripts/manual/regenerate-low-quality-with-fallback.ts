#!/usr/bin/env tsx
/**
 * 低品質な要約を段階的な品質基準で再生成するスクリプト
 * 
 * 使用方法:
 * npm run regenerate:quality-fallback
 * 
 * オプション:
 * --limit <数値>  処理する記事数の上限を指定
 * --dry-run      実際の更新を行わずにシミュレーション実行
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import { Article, Source } from '@/lib/prisma-exports';
import { 
  checkSummaryQuality,
  generateQualityReport
} from '../../lib/utils/summary/summary-quality-checker';
import { generateUnifiedPrompt } from '../../lib/utils/article/article-type-prompts';
import { cacheInvalidator } from '../../lib/cache/cache-invalidator';
import fetch from 'node-fetch';

const prisma = createPrismaClient();

// コマンドライン引数の解析
const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1]) : undefined;
const isDryRun = args.includes('--dry-run');

interface ArticleWithSource extends Article {
  source: Source;
}

interface LowQualityArticle {
  article: ArticleWithSource;
  score: number;
  issues: Array<{
    type: string;
    severity: string;
    message: string;
  }>;
}

interface RegenerationResult {
  id: string;
  title: string;
  beforeScore: number;
  afterScore: number;
  targetScore: number;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  error?: string;
  attempts: number;
  finalQuality: 'excellent' | 'good' | 'acceptable' | 'poor';
}

interface SummaryAndTags {
  summary: string;
  detailedSummary: string;
  tags: string[];
  articleType: string;
}

/**
 * 段階的な品質目標
 */
const QUALITY_TARGETS = [
  { threshold: 70, label: 'excellent', description: '理想的な品質' },
  { threshold: 60, label: 'good', description: '良好な品質' },
  { threshold: 50, label: 'acceptable', description: '許容可能な品質' },
  { threshold: 40, label: 'poor', description: '最低限の品質' }
];

/**
 * 要約とタグを生成（改良版プロンプト）
 */
async function generateSummaryAndTags(title: string, content: string, attemptNumber: number = 1): Promise<SummaryAndTags> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  // プロンプトを強化（品質重視）
  const enhancedPrompt = `
${generateUnifiedPrompt(title, content)}

【重要な品質要件】
- 一覧要約: 必ず150-180文字で、最後は必ず「。」で終わること
- 詳細要約: 必ず5つの箇条書きで、各項目は100-120文字
- 各箇条書きは「・」で始まり、句点なしで終わること
- 技術的な具体性を重視し、一般的な表現を避けること

【再生成指示】
これは${attemptNumber}回目の生成試行です。品質基準を満たすよう特に注意してください。
`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: enhancedPrompt }]
      }],
      generationConfig: {
        temperature: attemptNumber === 1 ? 0.3 : 0.4, // 再試行時は少し温度を上げる
        maxOutputTokens: 2500,
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as any;
  const responseText = data.candidates[0].content.parts[0].text.trim();
  
  return parseSummaryAndTags(responseText);
}

/**
 * APIレスポンスをパース
 */
function parseSummaryAndTags(responseText: string): SummaryAndTags {
  const lines = responseText.split('\n');
  let summary = '';
  let detailedSummary = '';
  let tags: string[] = [];
  let isDetailedSection = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (trimmedLine.startsWith('一覧要約:') || trimmedLine.startsWith('一覧要約：')) {
      summary = trimmedLine.replace(/一覧要約[:：]\s*/, '').trim();
    } else if (trimmedLine.startsWith('詳細要約:') || trimmedLine.startsWith('詳細要約：')) {
      isDetailedSection = true;
      const content = trimmedLine.replace(/詳細要約[:：]\s*/, '').trim();
      if (content) {
        detailedSummary = content;
      }
    } else if (trimmedLine.startsWith('タグ:') || trimmedLine.startsWith('タグ：')) {
      isDetailedSection = false;
      const tagLine = trimmedLine.replace(/タグ[:：]\s*/, '').trim();
      tags = tagLine.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    } else if (isDetailedSection && trimmedLine) {
      if (detailedSummary) {
        detailedSummary += '\n' + trimmedLine;
      } else {
        detailedSummary = trimmedLine;
      }
    }
  }

  // タグの正規化
  const normalizedTags: string[] = [];
  for (const tag of tags) {
    const normalized = tag.replace(/^["']|["']$/g, '').replace(/\s+/g, '').trim();
    if (normalized && !normalizedTags.includes(normalized)) {
      normalizedTags.push(normalized);
    }
  }

  return {
    summary: summary || '要約を生成できませんでした',
    detailedSummary: detailedSummary || '詳細要約を生成できませんでした',
    tags: normalizedTags.slice(0, 5),
    articleType: 'unified'
  };
}

/**
 * 低品質な要約を持つ記事を検出（改良版）
 */
async function detectLowQualityArticles(): Promise<LowQualityArticle[]> {
  console.error('\n🔍 低品質な要約を検出中...');
  
  // 要約がある全記事を取得
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
    take: limit || undefined
  }) as ArticleWithSource[];
  
  console.error(`   検査対象記事数: ${articles.length}件`);
  
  const lowQualityArticles: LowQualityArticle[] = [];
  const scoreDistribution = {
    excellent: 0,  // 70+
    good: 0,       // 60-69
    acceptable: 0, // 50-59
    poor: 0,       // 40-49
    veryPoor: 0    // < 40
  };
  
  for (const article of articles) {
    if (!article.summary) continue;
    
    const qualityCheck = checkSummaryQuality(
      article.summary,
      article.detailedSummary || ''
    );
    
    // スコア分布を記録
    if (qualityCheck.score >= 70) scoreDistribution.excellent++;
    else if (qualityCheck.score >= 60) scoreDistribution.good++;
    else if (qualityCheck.score >= 50) scoreDistribution.acceptable++;
    else if (qualityCheck.score >= 40) scoreDistribution.poor++;
    else scoreDistribution.veryPoor++;
    
    // 最低基準（40点）未満の記事を検出
    if (qualityCheck.score < 40) {
      lowQualityArticles.push({
        article,
        score: qualityCheck.score,
        issues: qualityCheck.issues
      });
    }
  }
  
  // 検出結果サマリー
  console.error('\n📊 品質分布:');
  console.error(`   優秀 (70+):     ${scoreDistribution.excellent}件 (${Math.round(scoreDistribution.excellent / articles.length * 100)}%)`);
  console.error(`   良好 (60-69):   ${scoreDistribution.good}件 (${Math.round(scoreDistribution.good / articles.length * 100)}%)`);
  console.error(`   許容 (50-59):   ${scoreDistribution.acceptable}件 (${Math.round(scoreDistribution.acceptable / articles.length * 100)}%)`);
  console.error(`   要改善 (40-49): ${scoreDistribution.poor}件 (${Math.round(scoreDistribution.poor / articles.length * 100)}%)`);
  console.error(`   不良 (<40):     ${scoreDistribution.veryPoor}件 (${Math.round(scoreDistribution.veryPoor / articles.length * 100)}%)`);
  
  console.error(`\n✅ 極低品質記事検出完了: ${lowQualityArticles.length}件`);
  
  return lowQualityArticles;
}

/**
 * 要約を段階的な品質目標で再生成
 */
async function regenerateSummariesWithFallback(lowQualityArticles: LowQualityArticle[]): Promise<RegenerationResult[]> {
  console.error('\n♻️  要約の再生成を開始（段階的品質目標）...');
  
  if (isDryRun) {
    console.error('   ⚠️  DRY-RUNモード: 実際の更新は行いません');
  }
  
  const results: RegenerationResult[] = [];
  const startTime = Date.now();
  
  for (let i = 0; i < lowQualityArticles.length; i++) {
    const { article, score: beforeScore, issues } = lowQualityArticles[i];
    
    console.error(`\n[${i + 1}/${lowQualityArticles.length}] 処理中: ${article.title.substring(0, 50)}...`);
    console.error(`   現在のスコア: ${beforeScore}点`);
    console.error(`   主な問題: ${issues.slice(0, 3).map(i => i.type).join(', ')}`);
    
    const result: RegenerationResult = {
      id: article.id,
      title: article.title,
      beforeScore,
      afterScore: beforeScore,
      targetScore: 70,
      status: 'skipped',
      attempts: 0,
      finalQuality: 'poor'
    };
    
    try {
      const content = article.content || '';
      
      // コンテンツ長チェック（緩和）
      if (content.length < 200) {
        console.error('   ⚠️  コンテンツが非常に短い（200文字未満）');
        // それでも試みる
      }
      
      // 段階的な品質目標で再生成
      const MAX_ATTEMPTS = 5; // 試行回数を増やす
      let bestResult: SummaryAndTags | null = null;
      let bestScore = beforeScore;
      let achieved = false;
      
      for (const target of QUALITY_TARGETS) {
        if (achieved) break;
        
        console.error(`   目標品質: ${target.label} (${target.threshold}点以上)`);
        result.targetScore = target.threshold;
        
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          result.attempts++;
          console.error(`   再生成試行 ${attempt}/${MAX_ATTEMPTS}...`);
          
          try {
            // 要約とタグを生成
            const generated = await generateSummaryAndTags(
              article.title,
              content,
              attempt
            );
            
            // 品質チェック
            const newQualityCheck = checkSummaryQuality(
              generated.summary,
              generated.detailedSummary
            );
            
            const currentScore = newQualityCheck.score;
            
            // ベストスコアを更新
            if (currentScore > bestScore) {
              bestScore = currentScore;
              bestResult = generated;
              result.afterScore = currentScore;
            }
            
            if (currentScore >= target.threshold) {
              console.error(`   ✅ 目標達成! スコア: ${currentScore}点 (${target.label})`);
              result.finalQuality = target.label as any;
              achieved = true;
              break;
            } else {
              console.error(`   未達成: ${currentScore}点 (目標: ${target.threshold}点)`);
              if (attempt < MAX_ATTEMPTS) {
                await sleep(2000);
              }
            }
          } catch (error) {
            console.error(`   ❌ エラー: ${error instanceof Error ? error.message : String(error)}`);
            result.error = error instanceof Error ? error.message : String(error);
            if (attempt < MAX_ATTEMPTS) {
              await sleep(5000);
            }
          }
        }
        
        if (!achieved && bestScore > beforeScore) {
          // 目標には届かなかったが、改善はされた
          console.error(`   ⚠️  部分的改善: ${beforeScore} → ${bestScore}点`);
        }
      }
      
      // 最良の結果を保存
      if (bestResult && bestScore > beforeScore && !isDryRun) {
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: bestResult.summary,
            detailedSummary: bestResult.detailedSummary,
            articleType: 'unified',
            summaryVersion: 4
          }
        });
        
        // タグの更新
        if (bestResult.tags.length > 0) {
          for (const tagName of bestResult.tags) {
            const tag = await prisma.tag.upsert({
              where: { name: tagName },
              update: {},
              create: { name: tagName }
            });
            
            await prisma.article.update({
              where: { id: article.id },
              data: {
                tags: {
                  connect: { id: tag.id }
                }
              }
            });
          }
        }
        
        if (bestScore >= 50) {
          result.status = 'success';
        } else {
          result.status = 'partial';
        }
        console.error(`   💫 改善完了: ${beforeScore} → ${bestScore}点`);
      } else if (bestScore === beforeScore) {
        result.status = 'failed';
        console.error(`   ❌ 改善できませんでした`);
      }
      
    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : String(error);
      console.error(`   ❌ 処理エラー: ${result.error}`);
    }
    
    results.push(result);
    
    // API制限対策
    if (i < lowQualityArticles.length - 1) {
      await sleep(3000);
    }
    
    // 進捗表示
    const processed = i + 1;
    const successCount = results.filter(r => r.status === 'success' || r.status === 'partial').length;
    const percentage = Math.round(processed / lowQualityArticles.length * 100);
    console.error(`\n📈 進捗: ${processed}/${lowQualityArticles.length} (${percentage}%) | 改善: ${successCount}件`);
  }
  
  const processingTime = Math.round((Date.now() - startTime) / 1000);
  console.error(`\n✅ 再生成処理完了（処理時間: ${processingTime}秒）`);
  
  return results;
}

/**
 * レポートを出力（改良版）
 */
function printDetailedReport(results: RegenerationResult[]) {
  console.error('\n' + '='.repeat(80));
  console.error('📊 再生成結果レポート（段階的品質目標）');
  console.error('='.repeat(80));
  
  const successResults = results.filter(r => r.status === 'success');
  const partialResults = results.filter(r => r.status === 'partial');
  const failedResults = results.filter(r => r.status === 'failed');
  const skippedResults = results.filter(r => r.status === 'skipped');
  
  console.error('\n【処理結果サマリー】');
  console.error(`  完全成功（50点以上）: ${successResults.length}件`);
  console.error(`  部分改善（改善あり）: ${partialResults.length}件`);
  console.error(`  失敗（改善なし）:     ${failedResults.length}件`);
  console.error(`  スキップ:             ${skippedResults.length}件`);
  
  // 品質別の達成状況
  const qualityAchievement = {
    excellent: results.filter(r => r.finalQuality === 'excellent').length,
    good: results.filter(r => r.finalQuality === 'good').length,
    acceptable: results.filter(r => r.finalQuality === 'acceptable').length,
    poor: results.filter(r => r.finalQuality === 'poor').length
  };
  
  console.error('\n【最終品質分布】');
  console.error(`  優秀 (70+):   ${qualityAchievement.excellent}件`);
  console.error(`  良好 (60-69): ${qualityAchievement.good}件`);
  console.error(`  許容 (50-59): ${qualityAchievement.acceptable}件`);
  console.error(`  要改善 (<50): ${qualityAchievement.poor}件`);
  
  // 改善度の統計
  const improvements = results
    .filter(r => r.afterScore > r.beforeScore)
    .map(r => r.afterScore - r.beforeScore);
  
  if (improvements.length > 0) {
    const avgImprovement = Math.round(improvements.reduce((a, b) => a + b, 0) / improvements.length);
    const maxImprovement = Math.max(...improvements);
    
    console.error('\n【改善統計】');
    console.error(`  改善された記事数: ${improvements.length}件`);
    console.error(`  平均改善度: +${avgImprovement}点`);
    console.error(`  最大改善度: +${maxImprovement}点`);
  }
  
  // 成功事例トップ5
  const topImprovements = [...results]
    .filter(r => r.afterScore > r.beforeScore)
    .sort((a, b) => (b.afterScore - b.beforeScore) - (a.afterScore - a.beforeScore))
    .slice(0, 5);
  
  if (topImprovements.length > 0) {
    console.error('\n【改善トップ5】');
    topImprovements.forEach((r, i) => {
      const improvement = r.afterScore - r.beforeScore;
      console.error(`  ${i + 1}. ${r.title.substring(0, 40)}...`);
      console.error(`     ${r.beforeScore} → ${r.afterScore}点 (+${improvement}点, ${r.finalQuality})`);
    });
  }
  
  console.error('\n' + '='.repeat(80));
}

/**
 * スリープ関数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * メイン処理
 */
async function main() {
  console.error('🚀 低品質要約の段階的再生成スクリプト');
  console.error('='.repeat(80));
  
  const startTime = Date.now();
  
  try {
    // 環境変数チェック
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY環境変数が設定されていません');
      process.exit(1);
    }
    
    // 設定表示
    console.error('\n⚙️  設定:');
    console.error(`   最低品質閾値: 40点（極低品質のみ対象）`);
    console.error(`   処理上限: ${limit ? `${limit}件` : '無制限'}`);
    console.error(`   実行モード: ${isDryRun ? 'DRY-RUN' : '本番実行'}`);
    console.error(`   品質目標: 段階的（70→60→50→40）`);
    
    // 低品質記事の検出
    const lowQualityArticles = await detectLowQualityArticles();
    
    if (lowQualityArticles.length === 0) {
      console.error('\n✨ 極低品質な要約（40点未満）は見つかりませんでした');
      await prisma.$disconnect();
      return;
    }
    
    // 確認プロンプト
    if (!isDryRun && lowQualityArticles.length > 5) {
      console.error(`\n⚠️  ${lowQualityArticles.length}件の極低品質記事を再生成します`);
      console.error('   処理を続行する場合は5秒お待ちください...');
      await sleep(5000);
    }
    
    // 要約の再生成
    const results = await regenerateSummariesWithFallback(lowQualityArticles);
    
    // レポート出力
    printDetailedReport(results);
    
    // キャッシュ無効化
    const improvedCount = results.filter(r => r.afterScore > r.beforeScore).length;
    if (!isDryRun && improvedCount > 0) {
      console.error('\n🔄 キャッシュを無効化中...');
      await cacheInvalidator.onBulkImport();
      console.error('✅ キャッシュ無効化完了');
    }
    
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.error(`\n⏱️  総処理時間: ${totalTime}秒`);
    console.error('\n✨ 処理が完了しました');
    
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// メイン処理を実行
main().catch(console.error);
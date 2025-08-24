#!/usr/bin/env tsx
/**
 * LocalLLM品質検証スクリプト
 * ロール明確化版プロンプトを使用して実際の記事で品質を検証
 */

import { PrismaClient } from '@prisma/client';
import { GeminiClient } from '../../lib/ai/gemini';
import { generateUnifiedPrompt } from '../../lib/utils/article-type-prompts';
import { checkSummaryQuality } from '../../lib/utils/summary-quality-checker';
import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ロール明確化版プロンプト（テストで最良の結果）
const OPTIMIZED_SYSTEM_PROMPT = `【役割】日本語技術記事要約者
【制約】
・日本語のみ出力
・思考過程は内部処理
・指定形式厳守
・英語フレーズ完全禁止`;

interface ValidationResult {
  articleId: string;
  title: string;
  source: string;
  publishedAt: Date;
  gemini: {
    summary: string;
    detailedSummary: string;
    tags: string[];
    score: number;
    processingTime: number;
    hasUnifiedFormat: boolean;
  };
  localLLM: {
    summary: string;
    detailedSummary: string;
    tags: string[];
    score: number;
    processingTime: number;
    hasEnglish: boolean;
    hasUnifiedFormat: boolean;
  };
  comparison: {
    scoreDiff: number;
    summaryLengthDiff: number;
    tagCountDiff: number;
    contentSimilarity: number;
  };
}

async function generateWithOptimizedLocalLLM(title: string, content: string) {
  const localLLMUrl = process.env.LOCAL_LLM_URL || 'http://192.168.11.7:1234';
  const localLLMModel = process.env.LOCAL_LLM_MODEL || 'openai/gpt-oss-20b';
  
  const startTime = Date.now();
  
  // 統一フォーマットプロンプトを生成
  const unifiedPrompt = generateUnifiedPrompt(title, content.substring(0, 4000));
  
  // ロール明確化版の指示を追加
  const userPrompt = `以下を要約してください。

${unifiedPrompt}

出力（この形式のみ）：
一覧要約: [要約内容]
詳細要約:
・[箇条書き1]
・[箇条書き2]
・[箇条書き3]
・[箇条書き4]
・[箇条書き5]
タグ: [タグリスト]`;
  
  // タイムアウト付きfetch（30秒）
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  
  const response = await fetch(`${localLLMUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: localLLMModel,
      messages: [
        { role: 'system', content: OPTIMIZED_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 2000,
      temperature: 0.3
    }),
    signal: controller.signal
  }).finally(() => clearTimeout(timeout));
  
  if (!response.ok) {
    throw new Error(`LocalLLM API error: ${response.status}`);
  }
  
  const data = await response.json() as any;
  const responseText = data.choices[0].message.content;
  const processingTime = Date.now() - startTime;
  
  // 英語混入チェック
  const englishPatterns = [
    /\b(let me|I need|I will|count|roughly|chars?|think|first|now)\b/i,
    /^[A-Za-z\s]+:/m  // 英語のラベル
  ];
  const hasEnglish = englishPatterns.some(pattern => pattern.test(responseText));
  
  // レスポンスをパース
  const result = parseResponse(responseText);
  
  // 統一フォーマットチェック
  const hasUnifiedFormat = result.detailedSummary.split('\n').every(line => 
    !line.trim() || line.trim().startsWith('・')
  );
  
  return {
    ...result,
    processingTime,
    hasEnglish,
    hasUnifiedFormat
  };
}

function parseResponse(text: string) {
  const lines = text.split('\n');
  let summary = '';
  let detailedSummary = '';
  let tags: string[] = [];
  let isDetailedSection = false;
  let isSummarySection = false;
  let isTagSection = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.match(/^(一覧)?要約[:：]/)) {
      isSummarySection = true;
      isDetailedSection = false;
      isTagSection = false;
      const content = trimmed.replace(/^(一覧)?要約[:：]\s*/, '').trim();
      if (content) {
        summary = content;
        isSummarySection = false;
      }
    } else if (trimmed.match(/^詳細要約[:：]/)) {
      isDetailedSection = true;
      isSummarySection = false;
      isTagSection = false;
    } else if (trimmed.match(/^タグ[:：]/)) {
      isTagSection = true;
      isDetailedSection = false;
      isSummarySection = false;
      const tagLine = trimmed.replace(/^タグ[:：]\s*/, '').trim();
      if (tagLine) {
        tags = tagLine.split(/[,、，]/).map(t => t.trim()).filter(t => t.length > 0);
        isTagSection = false;
      }
    } else if (isSummarySection && trimmed && !trimmed.startsWith('【')) {
      summary = trimmed;
      isSummarySection = false;
    } else if (isDetailedSection && trimmed.startsWith('・')) {
      detailedSummary += (detailedSummary ? '\n' : '') + trimmed;
    } else if (isTagSection && trimmed) {
      tags = trimmed.split(/[,、，]/).map(t => t.trim()).filter(t => t.length > 0);
      isTagSection = false;
    }
  }
  
  // フォールバック
  if (!summary) {
    summary = '要約生成に失敗しました。';
  }
  if (!detailedSummary) {
    detailedSummary = '・詳細要約の生成に失敗しました';
  }
  
  return { summary, detailedSummary, tags };
}

async function generateWithGemini(title: string, content: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  
  const startTime = Date.now();
  const client = new GeminiClient(apiKey);
  const result = await client.generateDetailedSummary(title, content);
  const processingTime = Date.now() - startTime;
  
  // 統一フォーマットチェック
  const hasUnifiedFormat = result.detailedSummary.split('\n').every(line => 
    !line.trim() || line.trim().startsWith('・')
  );
  
  return {
    ...result,
    processingTime,
    hasUnifiedFormat
  };
}

function calculateSimilarity(text1: string, text2: string): number {
  // 簡易的な類似度計算（単語の重複率）
  const words1 = new Set(text1.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g) || []);
  const words2 = new Set(text2.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g) || []);
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return (intersection.size / union.size) * 100;
}

async function validateQuality() {
  console.error('🔬 LocalLLM品質検証（ロール明確化版プロンプト）\n');
  console.error('================================================================================');
  
  // 様々なソースから記事を取得（3件に削減）
  const articles = await prisma.article.findMany({
    where: {
      AND: [
        { content: { not: '' } },
        { title: { not: '' } }
      ]
    },
    orderBy: { publishedAt: 'desc' },
    take: 3,  // 処理時間短縮のため3件に削減
    include: { source: true }
  });
  
  console.error(`📝 ${articles.length}件の実記事で検証\n`);
  
  const results: ValidationResult[] = [];
  let geminiErrors = 0;
  let localLLMErrors = 0;
  
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const content = article.content || article.description || '';
    
    console.error(`\n[記事 ${i + 1}/${articles.length}]`);
    console.error('────────────────────────────────────────────────────────────────────────────');
    console.error(`📄 ${article.title.substring(0, 60)}...`);
    console.error(`📚 ソース: ${article.source.name}`);
    console.error(`📅 ${article.publishedAt.toLocaleDateString()}\n`);
    
    let geminiResult: any = null;
    let localResult: any = null;
    
    // Gemini生成
    try {
      console.error('🔷 Gemini生成中...');
      geminiResult = await generateWithGemini(article.title, content);
      const geminiScore = checkSummaryQuality(geminiResult.summary, geminiResult.detailedSummary).score;
      geminiResult.score = geminiScore;
      console.error(`  ✅ 完了 (${geminiResult.processingTime}ms, スコア: ${geminiScore}点)`);
    } catch (error) {
      console.error(`  ❌ エラー: ${error}`);
      geminiErrors++;
    }
    
    // LocalLLM生成
    try {
      console.error('🟠 LocalLLM生成中...');
      localResult = await generateWithOptimizedLocalLLM(article.title, content);
      const localScore = checkSummaryQuality(localResult.summary, localResult.detailedSummary).score;
      localResult.score = localScore;
      console.error(`  ✅ 完了 (${localResult.processingTime}ms, スコア: ${localScore}点)`);
      console.error(`  🌐 英語混入: ${localResult.hasEnglish ? '❌ あり' : '✅ なし'}`);
      console.error(`  📋 統一フォーマット: ${localResult.hasUnifiedFormat ? '✅' : '❌'}`);
    } catch (error) {
      console.error(`  ❌ エラー: ${error}`);
      localLLMErrors++;
    }
    
    if (geminiResult && localResult) {
      // 比較結果を計算
      const comparison = {
        scoreDiff: localResult.score - geminiResult.score,
        summaryLengthDiff: localResult.summary.length - geminiResult.summary.length,
        tagCountDiff: localResult.tags.length - geminiResult.tags.length,
        contentSimilarity: calculateSimilarity(localResult.summary, geminiResult.summary)
      };
      
      results.push({
        articleId: article.id,
        title: article.title,
        source: article.source.name,
        publishedAt: article.publishedAt,
        gemini: geminiResult,
        localLLM: localResult,
        comparison
      });
      
      // 簡易比較表示
      console.error('\n📊 比較結果:');
      console.error(`  品質スコア差: ${comparison.scoreDiff > 0 ? '+' : ''}${comparison.scoreDiff}点`);
      console.error(`  要約類似度: ${comparison.contentSimilarity.toFixed(1)}%`);
      console.error(`  タグ数差: ${comparison.tagCountDiff > 0 ? '+' : ''}${comparison.tagCountDiff}個`);
    }
    
    // API制限対策
    if (i < articles.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  // 総合レポート
  console.error('\n================================================================================');
  console.error('📊 品質検証レポート');
  console.error('================================================================================\n');
  
  if (results.length > 0) {
    // 統計計算
    const avgGeminiScore = results.reduce((sum, r) => sum + r.gemini.score, 0) / results.length;
    const avgLocalScore = results.reduce((sum, r) => sum + r.localLLM.score, 0) / results.length;
    const avgSimilarity = results.reduce((sum, r) => sum + r.comparison.contentSimilarity, 0) / results.length;
    const englishRate = results.filter(r => r.localLLM.hasEnglish).length / results.length;
    const unifiedFormatRate = results.filter(r => r.localLLM.hasUnifiedFormat).length / results.length;
    
    console.error('【品質スコア】');
    console.error(`  Gemini平均: ${avgGeminiScore.toFixed(1)}点`);
    console.error(`  LocalLLM平均: ${avgLocalScore.toFixed(1)}点`);
    console.error(`  スコア差: ${(avgLocalScore - avgGeminiScore).toFixed(1)}点`);
    console.error();
    
    console.error('【要約内容】');
    console.error(`  平均類似度: ${avgSimilarity.toFixed(1)}%`);
    console.error(`  英語混入率: ${(englishRate * 100).toFixed(0)}%`);
    console.error(`  統一フォーマット適合率: ${(unifiedFormatRate * 100).toFixed(0)}%`);
    console.error();
    
    console.error('【エラー率】');
    console.error(`  Geminiエラー: ${geminiErrors}/${articles.length}件`);
    console.error(`  LocalLLMエラー: ${localLLMErrors}/${articles.length}件`);
    console.error();
    
    // 個別記事の詳細
    console.error('【記事別詳細】');
    results.forEach((r, i) => {
      console.error(`\n${i + 1}. ${r.title.substring(0, 40)}... (${r.source})`);
      console.error(`   Gemini: ${r.gemini.score}点 | LocalLLM: ${r.localLLM.score}点 (差: ${r.comparison.scoreDiff > 0 ? '+' : ''}${r.comparison.scoreDiff})`);
      console.error(`   類似度: ${r.comparison.contentSimilarity.toFixed(1)}% | 英語: ${r.localLLM.hasEnglish ? '有' : '無'}`);
    });
    
    // レポートファイル生成
    const reportPath = path.join('reports', 'local-llm-quality-validation.md');
    const reportContent = generateValidationReport(results, {
      avgGeminiScore,
      avgLocalScore,
      avgSimilarity,
      englishRate,
      unifiedFormatRate,
      geminiErrors,
      localLLMErrors,
      totalArticles: articles.length
    });
    
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, reportContent);
    console.error(`\n📝 詳細レポート生成: ${reportPath}`);
    
    // 実用性判定
    console.error('\n✨ 実用性判定');
    console.error('────────────────────────────────────────────────────────────────────────────');
    
    const isViable = 
      avgLocalScore >= avgGeminiScore * 0.8 &&  // 品質80%以上
      englishRate <= 0.2 &&                      // 英語混入20%以下
      unifiedFormatRate >= 0.8 &&                // フォーマット適合80%以上
      localLLMErrors <= geminiErrors + 1;        // エラー率が同等
    
    if (isViable) {
      console.error('✅ LocalLLMは実用レベルに達しています');
      console.error('   - 品質スコアがGeminiの80%以上');
      console.error('   - 英語混入が少ない');
      console.error('   - 統一フォーマットに対応');
    } else {
      console.error('⚠️  LocalLLMはさらなる改善が必要です');
      if (avgLocalScore < avgGeminiScore * 0.8) {
        console.error(`   - 品質スコアが不足 (${(avgLocalScore / avgGeminiScore * 100).toFixed(0)}%)`);
      }
      if (englishRate > 0.2) {
        console.error(`   - 英語混入が多い (${(englishRate * 100).toFixed(0)}%)`);
      }
      if (unifiedFormatRate < 0.8) {
        console.error(`   - フォーマット適合率が低い (${(unifiedFormatRate * 100).toFixed(0)}%)`);
      }
    }
  }
  
  console.error('\n✅ 検証完了！');
  await prisma.$disconnect();
}

function generateValidationReport(results: ValidationResult[], stats: any): string {
  const now = new Date().toISOString();
  
  return `# LocalLLM品質検証レポート
生成日時: ${now}

## 検証概要
- **検証記事数**: ${stats.totalArticles}件
- **成功率**: LocalLLM ${((stats.totalArticles - stats.localLLMErrors) / stats.totalArticles * 100).toFixed(0)}% / Gemini ${((stats.totalArticles - stats.geminiErrors) / stats.totalArticles * 100).toFixed(0)}%
- **使用プロンプト**: ロール明確化版

## 品質評価

### スコア比較
| 指標 | Gemini | LocalLLM | 差分 |
|------|--------|----------|------|
| 平均スコア | ${stats.avgGeminiScore.toFixed(1)}点 | ${stats.avgLocalScore.toFixed(1)}点 | ${(stats.avgLocalScore - stats.avgGeminiScore).toFixed(1)}点 |
| 最高スコア | ${Math.max(...results.map(r => r.gemini.score))}点 | ${Math.max(...results.map(r => r.localLLM.score))}点 | - |
| 最低スコア | ${Math.min(...results.map(r => r.gemini.score))}点 | ${Math.min(...results.map(r => r.localLLM.score))}点 | - |

### 品質指標
| 指標 | 値 | 評価 |
|------|-----|------|
| 要約類似度 | ${stats.avgSimilarity.toFixed(1)}% | ${stats.avgSimilarity >= 60 ? '✅ 良好' : '⚠️ 要改善'} |
| 英語混入率 | ${(stats.englishRate * 100).toFixed(0)}% | ${stats.englishRate <= 0.2 ? '✅ 良好' : '⚠️ 要改善'} |
| 統一フォーマット適合率 | ${(stats.unifiedFormatRate * 100).toFixed(0)}% | ${stats.unifiedFormatRate >= 0.8 ? '✅ 良好' : '⚠️ 要改善'} |

## 記事別詳細結果

${results.map((r, i) => `
### ${i + 1}. ${r.title.substring(0, 50)}...
- **ソース**: ${r.source}
- **公開日**: ${r.publishedAt.toLocaleDateString()}

#### スコア
- Gemini: ${r.gemini.score}点
- LocalLLM: ${r.localLLM.score}点 (差: ${r.comparison.scoreDiff > 0 ? '+' : ''}${r.comparison.scoreDiff})

#### 品質指標
- 要約類似度: ${r.comparison.contentSimilarity.toFixed(1)}%
- 英語混入: ${r.localLLM.hasEnglish ? '❌ あり' : '✅ なし'}
- 統一フォーマット: ${r.localLLM.hasUnifiedFormat ? '✅ 対応' : '❌ 非対応'}

#### 生成内容比較
**Gemini要約** (${r.gemini.summary.length}文字):
> ${r.gemini.summary}

**LocalLLM要約** (${r.localLLM.summary.length}文字):
> ${r.localLLM.summary}

**タグ比較**:
- Gemini: ${r.gemini.tags.join(', ')}
- LocalLLM: ${r.localLLM.tags.join(', ')}
`).join('\n')}

## 実用性評価

### 判定基準
- ✅ 品質スコア: Geminiの80%以上 → ${stats.avgLocalScore >= stats.avgGeminiScore * 0.8 ? '達成' : '未達成'}
- ✅ 英語混入率: 20%以下 → ${stats.englishRate <= 0.2 ? '達成' : '未達成'}
- ✅ フォーマット適合率: 80%以上 → ${stats.unifiedFormatRate >= 0.8 ? '達成' : '未達成'}

### 総合判定
${
  stats.avgLocalScore >= stats.avgGeminiScore * 0.8 &&
  stats.englishRate <= 0.2 &&
  stats.unifiedFormatRate >= 0.8
    ? '**✅ 実用レベル達成**\n\nLocalLLMは実用的な品質を達成しています。段階的な移行を推奨します。'
    : '**⚠️ さらなる改善が必要**\n\n以下の点を改善することで実用レベルに到達可能です：\n' +
      (stats.avgLocalScore < stats.avgGeminiScore * 0.8 ? '- 品質スコアの向上\n' : '') +
      (stats.englishRate > 0.2 ? '- 英語混入の削減\n' : '') +
      (stats.unifiedFormatRate < 0.8 ? '- フォーマット適合率の改善\n' : '')
}

## 推奨事項

1. **短期的対応**
   - ${stats.englishRate > 0.2 ? 'プロンプトの更なる最適化による英語混入の削減' : '現在のプロンプトを維持'}
   - ${stats.unifiedFormatRate < 0.8 ? '統一フォーマット出力の安定化' : '統一フォーマット対応は良好'}

2. **中期的対応**
   - 品質の低い記事カテゴリの特定と個別対策
   - エラー発生パターンの分析と対策

3. **長期的対応**
   - モデルのファインチューニング検討
   - ハイブリッド運用（重要記事はGemini、その他はLocalLLM）

---
*Generated at ${now}*
`;
}

// 実行
validateQuality().catch(console.error);
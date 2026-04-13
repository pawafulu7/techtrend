#!/usr/bin/env tsx
/**
 * Gemini vs LocalLLM品質比較スクリプト
 * 同じ記事で両方のLLMを使って要約を生成し、品質を比較
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import { LocalLLMClient } from '../../lib/ai/local-llm';
import { GeminiClient } from '../../lib/ai/gemini';
import { generateUnifiedPrompt } from '../../lib/utils/article/article-type-prompts';
import { checkSummaryQuality } from '../../lib/utils/summary/summary-quality-checker';
import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';

const prisma = createPrismaClient();

interface ComparisonResult {
  articleId: string;
  title: string;
  gemini: {
    summary: string;
    detailedSummary: string;
    tags: string[];
    score: number;
    processingTime: number;
    cost: number;
  };
  localLLM: {
    summary: string;
    detailedSummary: string;
    tags: string[];
    score: number;
    processingTime: number;
    cost: number;
  };
}

async function generateWithGemini(title: string, content: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  
  const startTime = Date.now();
  const client = new GeminiClient(apiKey);
  const result = await client.generateDetailedSummary(title, content);
  const processingTime = Date.now() - startTime;
  
  // コスト計算（概算: $0.00015 per 1K characters）
  const inputChars = (title + content).length;
  const outputChars = (result.summary + result.detailedSummary).length;
  const cost = ((inputChars + outputChars) / 1000) * 0.00015;
  
  return {
    ...result,
    processingTime,
    cost
  };
}

async function generateWithLocalLLM(title: string, content: string) {
  const localLLMUrl = process.env.LOCAL_LLM_URL || 'http://192.168.11.7:1234';
  const localLLMModel = process.env.LOCAL_LLM_MODEL || 'openai/gpt-oss-20b';
  
  const startTime = Date.now();
  const prompt = generateUnifiedPrompt(title, content);
  
  const response = await fetch(`${localLLMUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: localLLMModel,
      messages: [
        {
          role: 'system',
          content: '日本語で応答する技術記事分析アシスタントです。指定された形式に従って正確に出力してください。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.3
    })
  });
  
  if (!response.ok) {
    throw new Error(`LocalLLM API error: ${response.status}`);
  }
  
  const data = await response.json() as any;
  const responseText = data.choices[0].message.content;
  const processingTime = Date.now() - startTime;
  
  // LocalLLMのコストは0（電気代は考慮しない）
  const cost = 0;
  
  // レスポンスをパース
  const result = parseResponse(responseText);
  
  return {
    ...result,
    processingTime,
    cost
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
    
    if (trimmed.startsWith('一覧要約:') || trimmed.startsWith('要約:')) {
      isSummarySection = true;
      isDetailedSection = false;
      isTagSection = false;
      const content = trimmed.replace(/^(一覧)?要約:/, '').trim();
      if (content) {
        summary = content;
        isSummarySection = false;
      }
    } else if (trimmed.startsWith('詳細要約:')) {
      isDetailedSection = true;
      isSummarySection = false;
      isTagSection = false;
    } else if (trimmed.startsWith('タグ:')) {
      isTagSection = true;
      isDetailedSection = false;
      isSummarySection = false;
      const tagLine = trimmed.replace('タグ:', '').trim();
      if (tagLine) {
        tags = tagLine.split(',').map(t => t.trim()).filter(t => t.length > 0);
        isTagSection = false;
      }
    } else if (isSummarySection && trimmed && !trimmed.startsWith('【')) {
      summary = trimmed;
      isSummarySection = false;
    } else if (isDetailedSection && trimmed.startsWith('・')) {
      detailedSummary += (detailedSummary ? '\n' : '') + trimmed;
    } else if (isTagSection && trimmed) {
      tags = trimmed.split(',').map(t => t.trim()).filter(t => t.length > 0);
      isTagSection = false;
    }
  }
  
  return { summary, detailedSummary, tags };
}

async function compareQuality() {
  console.error('🔬 Gemini vs LocalLLM品質比較テスト\n');
  console.error('================================================================================');
  
  // テスト用に最新の記事を5件取得
  const articles = await prisma.article.findMany({
    where: {
      content: { not: null },
      title: { not: null }
    },
    orderBy: { publishedAt: 'desc' },
    take: 5,
    include: { source: true }
  });
  
  console.error(`📝 ${articles.length}件の記事で比較テスト\n`);
  
  const results: ComparisonResult[] = [];
  
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const content = article.content || '';
    
    console.error(`\n[記事 ${i + 1}/${articles.length}]`);
    console.error('────────────────────────────────────────────────────────────────────────────');
    console.error(`📄 ${article.title.substring(0, 60)}...`);
    console.error(`📅 ${article.publishedAt.toLocaleDateString()}`);
    console.error(`📚 ソース: ${article.source.name}\n`);
    
    try {
      // Geminiで生成
      console.error('🔷 Gemini生成中...');
      const geminiResult = await generateWithGemini(article.title, content);
      const geminiScore = checkSummaryQuality(geminiResult.summary, geminiResult.detailedSummary).score;
      console.error(`  ✅ 完了 (${geminiResult.processingTime}ms, スコア: ${geminiScore}点)`);
      
      // LocalLLMで生成
      console.error('🟠 LocalLLM生成中...');
      const localResult = await generateWithLocalLLM(article.title, content);
      const localScore = checkSummaryQuality(localResult.summary, localResult.detailedSummary).score;
      console.error(`  ✅ 完了 (${localResult.processingTime}ms, スコア: ${localScore}点)`);
      
      // 結果を保存
      results.push({
        articleId: article.id,
        title: article.title,
        gemini: {
          ...geminiResult,
          score: geminiScore
        },
        localLLM: {
          ...localResult,
          score: localScore
        }
      });
      
      // 簡易比較表示
      console.error('\n📊 比較結果:');
      console.error(`  品質スコア: Gemini ${geminiScore}点 vs LocalLLM ${localScore}点`);
      console.error(`  処理速度: Gemini ${geminiResult.processingTime}ms vs LocalLLM ${localResult.processingTime}ms`);
      console.error(`  タグ数: Gemini ${geminiResult.tags.length}個 vs LocalLLM ${localResult.tags.length}個`);
      
      // API制限対策で待機（Gemini用）
      if (i < articles.length - 1) {
        console.error('\n⏳ 次の記事まで5秒待機...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
    } catch (error) {
      console.error(`❌ エラー: ${error}`);
    }
  }
  
  // 総合レポート生成
  console.error('\n================================================================================');
  console.error('📊 総合比較レポート');
  console.error('================================================================================\n');
  
  if (results.length > 0) {
    // 平均値計算
    const avgGeminiScore = results.reduce((sum, r) => sum + r.gemini.score, 0) / results.length;
    const avgLocalScore = results.reduce((sum, r) => sum + r.localLLM.score, 0) / results.length;
    const avgGeminiTime = results.reduce((sum, r) => sum + r.gemini.processingTime, 0) / results.length;
    const avgLocalTime = results.reduce((sum, r) => sum + r.localLLM.processingTime, 0) / results.length;
    const totalGeminiCost = results.reduce((sum, r) => sum + r.gemini.cost, 0);
    
    console.error('【品質スコア】');
    console.error(`  Gemini平均: ${avgGeminiScore.toFixed(1)}点`);
    console.error(`  LocalLLM平均: ${avgLocalScore.toFixed(1)}点`);
    console.error(`  優位性: ${avgGeminiScore > avgLocalScore ? 'Gemini' : avgLocalScore > avgGeminiScore ? 'LocalLLM' : '同等'}`);
    console.error();
    
    console.error('【処理速度】');
    console.error(`  Gemini平均: ${Math.round(avgGeminiTime)}ms`);
    console.error(`  LocalLLM平均: ${Math.round(avgLocalTime)}ms`);
    console.error(`  速度差: ${avgGeminiTime > avgLocalTime ? 
      `LocalLLMが${Math.round(avgGeminiTime / avgLocalTime)}倍高速` : 
      `Geminiが${Math.round(avgLocalTime / avgGeminiTime)}倍高速`}`);
    console.error();
    
    console.error('【コスト】');
    console.error(`  Gemini: $${totalGeminiCost.toFixed(4)} (${results.length}記事)`);
    console.error(`  LocalLLM: $0.00 (電気代除く)`);
    console.error(`  月間予測 (1000記事): Gemini $${(totalGeminiCost * 1000 / results.length).toFixed(2)} vs LocalLLM $0.00`);
    console.error();
    
    // レポートファイル生成
    const reportPath = path.join('reports', 'llm-comparison-report.md');
    const reportContent = generateMarkdownReport(results, {
      avgGeminiScore,
      avgLocalScore,
      avgGeminiTime,
      avgLocalTime,
      totalGeminiCost
    });
    
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, reportContent);
    console.error(`📝 詳細レポート生成: ${reportPath}`);
  }
  
  console.error('\n✨ 比較テスト完了！');
  await prisma.$disconnect();
}

function generateMarkdownReport(
  results: ComparisonResult[],
  stats: any
): string {
  const now = new Date().toISOString().split('T')[0];
  
  return `# LLM品質比較レポート (${now})

## 概要
Gemini 1.5 Flash vs LocalLLM (GPT-OSS 20B) の品質比較結果

## テスト環境
- **記事数**: ${results.length}件
- **Geminiモデル**: gemini-1.5-flash
- **LocalLLMモデル**: openai/gpt-oss-20b
- **フォーマット**: 統一フォーマット（Version 5）

## 総合評価

### 品質スコア（100点満点）
| LLM | 平均スコア | 最高スコア | 最低スコア |
|-----|-----------|-----------|-----------|
| Gemini | ${stats.avgGeminiScore.toFixed(1)}点 | ${Math.max(...results.map(r => r.gemini.score))}点 | ${Math.min(...results.map(r => r.gemini.score))}点 |
| LocalLLM | ${stats.avgLocalScore.toFixed(1)}点 | ${Math.max(...results.map(r => r.localLLM.score))}点 | ${Math.min(...results.map(r => r.localLLM.score))}点 |

### 処理速度
| LLM | 平均処理時間 | 最速 | 最遅 |
|-----|-------------|------|------|
| Gemini | ${Math.round(stats.avgGeminiTime)}ms | ${Math.min(...results.map(r => r.gemini.processingTime))}ms | ${Math.max(...results.map(r => r.gemini.processingTime))}ms |
| LocalLLM | ${Math.round(stats.avgLocalTime)}ms | ${Math.min(...results.map(r => r.localLLM.processingTime))}ms | ${Math.max(...results.map(r => r.localLLM.processingTime))}ms |

### コスト比較
| LLM | テストコスト | 月間予測（1000記事） | 年間予測（12000記事） |
|-----|-------------|-------------------|---------------------|
| Gemini | $${stats.totalGeminiCost.toFixed(4)} | $${(stats.totalGeminiCost * 1000 / results.length).toFixed(2)} | $${(stats.totalGeminiCost * 12000 / results.length).toFixed(2)} |
| LocalLLM | $0.00 | $0.00 | $0.00 |

## 詳細結果

${results.map((r, i) => `
### 記事 ${i + 1}: ${r.title.substring(0, 50)}...

#### Gemini結果
- **スコア**: ${r.gemini.score}点
- **処理時間**: ${r.gemini.processingTime}ms
- **タグ数**: ${r.gemini.tags.length}個
- **要約文字数**: ${r.gemini.summary.length}文字

#### LocalLLM結果
- **スコア**: ${r.localLLM.score}点
- **処理時間**: ${r.localLLM.processingTime}ms
- **タグ数**: ${r.localLLM.tags.length}個
- **要約文字数**: ${r.localLLM.summary.length}文字

#### 比較
- **品質**: ${r.gemini.score > r.localLLM.score ? 'Gemini優位' : r.localLLM.score > r.gemini.score ? 'LocalLLM優位' : '同等'}
- **速度**: ${r.gemini.processingTime < r.localLLM.processingTime ? 'Gemini高速' : 'LocalLLM高速'}
`).join('\n')}

## 結論と推奨事項

### 長所比較
| 項目 | Gemini | LocalLLM |
|------|--------|----------|
| 品質安定性 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 処理速度 | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| コスト効率 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| スケーラビリティ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 運用の容易さ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

### 推奨運用方法
${stats.avgLocalScore >= stats.avgGeminiScore * 0.9 ? 
`✅ **LocalLLMへの移行を推奨**
- 品質スコアがGeminiの90%以上を達成
- コスト削減効果が大きい
- Rate Limit問題を完全に回避可能` :
`⚠️ **段階的移行を推奨**
- まずは一部の記事でLocalLLMを試用
- 品質が重要な記事はGeminiを継続使用
- LocalLLMの品質改善を継続的に実施`}

### 移行ロードマップ
1. **Phase 1**: テスト環境でLocalLLM運用（1週間）
2. **Phase 2**: 20%の記事でA/Bテスト（2週間）
3. **Phase 3**: 問題なければ50%に拡大（2週間）
4. **Phase 4**: 全面移行またはハイブリッド運用決定

---
*Generated at ${new Date().toISOString()}*
`;
}

// 実行
compareQuality().catch(console.error);
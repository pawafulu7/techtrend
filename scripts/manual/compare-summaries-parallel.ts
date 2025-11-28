import { PrismaClient, Article, Source, Tag } from '@prisma/client';
import { GeminiClient } from '../../lib/ai/gemini';
import { ClaudeHandler } from '../../lib/ai/claude-handler';
import * as readline from 'readline';
import fetch from 'node-fetch';
import { detectArticleType } from '../../lib/utils/article-type-detector';
import { generatePromptForArticleType } from '../../lib/utils/article-type-prompts';

const prisma = new PrismaClient();
const claudeHandler = new ClaudeHandler();

// 対話的インターフェース用のreadline設定
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// プロンプト表示用の関数
function askQuestion(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// 並列実行のための記事処理
async function processArticleInParallel(
  article: Article & { source: Source; tags: Tag[] },
  index: number,
  total: number
): Promise<ComparisonResult> {
  console.error(`\n[${index + 1}/${total}] ${article.title}`);
  
  const content = article.content || '';
  const result: ComparisonResult = {
    articleId: article.id,
    title: article.title,
    gemini: {
      summary: '',
      detailedSummary: '',
      tags: [],
      metrics: {} as QualityMetrics
    },
    claude: {
      summary: '',
      detailedSummary: '',
      tags: [],
      metrics: {} as QualityMetrics
    }
  };
  
  // Gemini生成（非対話的なので並列実行可能）
  const geminiPromise = generateWithGemini(article.title, content)
    .then(geminiResult => {
      result.gemini = geminiResult;
      console.error(`✓ Gemini完了: ${article.title.substring(0, 30)}...`);
    })
    .catch(error => {
      result.gemini.error = error instanceof Error ? error.message : String(error);
      console.error(`✗ Geminiエラー: ${article.title.substring(0, 30)}...`);
    });
  
  // Claude生成（対話的なので順次実行）
  console.error('\nClaudeで生成します:');
  try {
    const claudeResult = await generateWithClaudeSimulated(article.title, content);
    result.claude = claudeResult;
    console.error(`✓ Claude完了: ${article.title.substring(0, 30)}...`);
  } catch (error) {
    result.claude.error = error instanceof Error ? error.message : String(error);
    console.error(`✗ Claudeエラー: ${article.title.substring(0, 30)}...`);
  }
  
  // Geminiの処理完了を待つ
  await geminiPromise;
  
  return result;
}

// Claude生成のシミュレーション（テスト用）
async function generateWithClaudeSimulated(
  title: string, 
  content: string
): Promise<{
  summary: string;
  detailedSummary: string;
  tags: string[];
  metrics: QualityMetrics;
}> {
  const startTime = Date.now();
  
  // 実際の使用時はここで対話的な入力を求める
  console.error('Claude生成をシミュレート中...');
  
  // シミュレーション用のレスポンス
  const simulatedResponse = `要約: ${title.substring(0, 70)}について解説し、実装方法と効果を説明。

詳細要約: この記事では${title}について詳しく解説しています。
・主要な技術的特徴
・実装における注意点
・期待される効果とメリット

タグ: 技術記事, プログラミング, 開発`;
  
  const result = claudeHandler.parseSummaryAndTags(
    simulatedResponse, 
    detectArticleType(title, content)
  );
  
  const processingTime = Date.now() - startTime;
  
  return {
    summary: result.summary,
    detailedSummary: result.detailedSummary,
    tags: result.tags,
    metrics: calculateMetrics(result, processingTime)
  };
}

// バッチ処理の最適化
async function processBatch(
  articles: Array<Article & { source: Source; tags: Tag[] }>
): Promise<ComparisonResult[]> {
  console.error(`\n${articles.length}件の記事をバッチ処理します...\n`);
  
  // 各記事を並列処理
  const promises = articles.map((article, index) => 
    processArticleInParallel(article, index, articles.length)
  );
  
  // すべての処理が完了するまで待つ
  const results = await Promise.all(promises);
  
  return results;
}

// 結果のサマリー表示
function displayBatchSummary(results: ComparisonResult[]) {
  console.error('\n' + '='.repeat(80));
  console.error('バッチ処理結果サマリー');
  console.error('='.repeat(80));
  
  let geminiSuccess = 0;
  let geminiError = 0;
  let claudeSuccess = 0;
  let claudeError = 0;
  let geminiTotalScore = 0;
  let claudeTotalScore = 0;
  
  results.forEach((result) => {
    if (result.gemini.error) {
      geminiError++;
    } else {
      geminiSuccess++;
      geminiTotalScore += calculateQualityScore(result.gemini.metrics);
    }
    
    if (result.claude.error) {
      claudeError++;
    } else {
      claudeSuccess++;
      claudeTotalScore += calculateQualityScore(result.claude.metrics);
    }
  });
  
  console.error('\n処理結果:');
  console.error(`Gemini: 成功 ${geminiSuccess}件 / エラー ${geminiError}件`);
  console.error(`Claude: 成功 ${claudeSuccess}件 / エラー ${claudeError}件`);
  
  if (geminiSuccess > 0 && claudeSuccess > 0) {
    console.error('\n品質スコア:');
    console.error(`Gemini 平均: ${Math.round(geminiTotalScore / geminiSuccess)}/100`);
    console.error(`Claude 平均: ${Math.round(claudeTotalScore / claudeSuccess)}/100`);
    
    const difference = Math.abs(geminiTotalScore / geminiSuccess - claudeTotalScore / claudeSuccess);
    if (difference < 5) {
      console.error('\n🤝 両者はほぼ同等の品質です。');
    } else if (claudeTotalScore > geminiTotalScore) {
      console.error('\n✨ Claudeの品質が優れています！');
    } else {
      console.error('\n📊 Geminiの品質が優れています。');
    }
  }
  
  // 処理時間の比較
  const geminiAvgTime = results
    .filter(r => !r.gemini.error)
    .reduce((sum, r) => sum + r.gemini.metrics.processingTime, 0) / geminiSuccess || 0;
  
  const claudeAvgTime = results
    .filter(r => !r.claude.error)
    .reduce((sum, r) => sum + r.claude.metrics.processingTime, 0) / claudeSuccess || 0;
  
  console.error('\n平均処理時間:');
  console.error(`Gemini: ${Math.round(geminiAvgTime)}ms`);
  console.error(`Claude: ${Math.round(claudeAvgTime)}ms`);
}

// 既存の関数を再利用（インポート部分省略）
interface QualityMetrics {
  summaryLength: number;
  detailedSummaryLength: number;
  tagCount: number;
  hasProperPunctuation: boolean;
  isWithinTargetLength: boolean;
  processingTime: number;
}

interface ComparisonResult {
  articleId: string;
  title: string;
  gemini: {
    summary: string;
    detailedSummary: string;
    tags: string[];
    metrics: QualityMetrics;
    error?: string;
  };
  claude: {
    summary: string;
    detailedSummary: string;
    tags: string[];
    metrics: QualityMetrics;
    error?: string;
  };
}

async function generateWithGemini(title: string, content: string): Promise<{
  summary: string;
  detailedSummary: string;
  tags: string[];
  metrics: QualityMetrics;
}> {
  const startTime = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const articleType = detectArticleType(title, content);
  const prompt = generatePromptForArticleType(articleType, title, content);
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2500,
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as any;
  const responseText = data.candidates[0].content.parts[0].text.trim();
  
  const result = parseGeminiResponse(responseText);
  const processingTime = Date.now() - startTime;
  
  return {
    ...result,
    metrics: calculateMetrics(result, processingTime)
  };
}

function calculateMetrics(
  result: { summary: string; detailedSummary: string; tags: string[] },
  processingTime: number
): QualityMetrics {
  return {
    summaryLength: result.summary.length,
    detailedSummaryLength: result.detailedSummary.length,
    tagCount: result.tags.length,
    hasProperPunctuation: result.summary.endsWith('。'),
    isWithinTargetLength: result.summary.length >= 60 && result.summary.length <= 80,
    processingTime
  };
}

function parseGeminiResponse(text: string): {
  summary: string;
  detailedSummary: string;
  tags: string[];
} {
  const lines = text.split('\n');
  let summary = '';
  let detailedSummary = '';
  let tags: string[] = [];
  
  for (const line of lines) {
    if (line.match(/^要約[:：]/)) {
      summary = line.replace(/^要約[:：]\s*/, '').trim();
    } else if (line.match(/^詳細要約[:：]/)) {
      detailedSummary = line.replace(/^詳細要約[:：]\s*/, '').trim();
    } else if (line.match(/^タグ[:：]/)) {
      const tagLine = line.replace(/^タグ[:：]\s*/, '');
      tags = tagLine.split(/[,、，]/)
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0 && tag.length <= 30);
    }
  }
  
  if (!summary) summary = text.substring(0, 80);
  if (!detailedSummary) detailedSummary = text.substring(0, 200);
  
  return { summary, detailedSummary, tags };
}

function calculateQualityScore(metrics: QualityMetrics): number {
  let score = 0;
  
  if (metrics.isWithinTargetLength) score += 40;
  else if (metrics.summaryLength >= 50 && metrics.summaryLength <= 90) score += 20;
  
  if (metrics.hasProperPunctuation) score += 20;
  
  if (metrics.tagCount >= 3 && metrics.tagCount <= 5) score += 20;
  else if (metrics.tagCount >= 2 && metrics.tagCount <= 6) score += 10;
  
  if (metrics.detailedSummaryLength >= 100) score += 20;
  else if (metrics.detailedSummaryLength >= 50) score += 10;
  
  return score;
}

// メイン処理（並列実行版）
async function main() {
  console.error('🚀 要約品質比較ツール（並列実行版）');
  console.error('===================================\n');
  
  try {
    const limitStr = await askQuestion('比較する記事数を入力してください (デフォルト: 5): ');
    const limit = parseInt(limitStr) || 5;
    
    const articles = await prisma.article.findMany({
      include: { source: true, tags: true },
      orderBy: { publishedAt: 'desc' },
      take: limit
    });
    
    if (articles.length === 0) {
      console.error('記事が見つかりません');
      return;
    }
    
    // バッチ処理で並列実行
    const startTime = Date.now();
    const results = await processBatch(articles);
    const totalTime = Date.now() - startTime;
    
    // 結果の表示
    displayBatchSummary(results);
    
    console.error(`\n総処理時間: ${(totalTime / 1000).toFixed(2)}秒`);
    console.error(`平均処理時間: ${(totalTime / articles.length / 1000).toFixed(2)}秒/記事`);
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

// スクリプトの実行
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
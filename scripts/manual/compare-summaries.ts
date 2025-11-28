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

// 品質評価指標
interface QualityMetrics {
  summaryLength: number;
  detailedSummaryLength: number;
  tagCount: number;
  hasProperPunctuation: boolean;
  isWithinTargetLength: boolean;
  processingTime: number;
}

// 比較結果
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

// Gemini APIで要約生成
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
  
  // 既存のパース処理（generate-summaries.tsから）
  const result = parseGeminiResponse(responseText);
  const processingTime = Date.now() - startTime;
  
  return {
    ...result,
    metrics: calculateMetrics(result, processingTime)
  };
}

// Claude Codeで要約生成（対話的）
async function generateWithClaude(
  title: string, 
  content: string
): Promise<{
  summary: string;
  detailedSummary: string;
  tags: string[];
  metrics: QualityMetrics;
}> {
  const startTime = Date.now();
  
  console.error('\n=== Claude Code要約生成 ===');
  const prompt = claudeHandler.getPromptForArticle(title, content);
  console.error('プロンプト（最初の300文字）:');
  console.error(prompt.substring(0, 300) + '...\n');
  
  console.error('Claude Codeで要約を生成してください。');
  console.error('形式: 要約: / 詳細要約: / タグ:');
  console.error('入力完了後、空行を2回入力してください。\n');
  
  // ユーザー入力を受け取る
  const inputLines: string[] = [];
  let emptyLineCount = 0;
  
  while (true) {
    const line = await askQuestion('> ');
    
    if (line === '') {
      emptyLineCount++;
      if (emptyLineCount >= 2) {
        break;
      }
      inputLines.push(line);
    } else {
      emptyLineCount = 0;
      inputLines.push(line);
    }
  }
  
  const responseText = inputLines.join('\n');
  const result = claudeHandler.parseSummaryAndTags(responseText, detectArticleType(title, content));
  const processingTime = Date.now() - startTime;
  
  return {
    summary: result.summary,
    detailedSummary: result.detailedSummary,
    tags: result.tags,
    metrics: calculateMetrics(result, processingTime)
  };
}

// メトリクス計算
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

// Geminiレスポンスのパース（既存実装から）
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
  
  // フォールバック
  if (!summary) {
    summary = text.substring(0, 80);
  }
  if (!detailedSummary) {
    detailedSummary = text.substring(0, 200);
  }
  
  return { summary, detailedSummary, tags };
}

// 比較結果の表示
function displayComparison(result: ComparisonResult) {
  console.error('\n' + '='.repeat(80));
  console.error(`記事: ${result.title}`);
  console.error('='.repeat(80));
  
  console.error('\n--- Gemini ---');
  if (result.gemini.error) {
    console.error(`エラー: ${result.gemini.error}`);
  } else {
    console.error(`要約: ${result.gemini.summary}`);
    console.error(`文字数: ${result.gemini.metrics.summaryLength}`);
    console.error(`タグ: ${result.gemini.tags.join(', ')}`);
    console.error(`処理時間: ${result.gemini.metrics.processingTime}ms`);
  }
  
  console.error('\n--- Claude ---');
  if (result.claude.error) {
    console.error(`エラー: ${result.claude.error}`);
  } else {
    console.error(`要約: ${result.claude.summary}`);
    console.error(`文字数: ${result.claude.metrics.summaryLength}`);
    console.error(`タグ: ${result.claude.tags.join(', ')}`);
    console.error(`処理時間: ${result.claude.metrics.processingTime}ms`);
  }
  
  console.error('\n--- 品質評価 ---');
  displayQualityComparison(result);
}

// 品質比較の表示
function displayQualityComparison(result: ComparisonResult) {
  const geminiScore = calculateQualityScore(result.gemini.metrics);
  const claudeScore = calculateQualityScore(result.claude.metrics);
  
  console.error(`Gemini スコア: ${geminiScore}/100`);
  console.error(`Claude スコア: ${claudeScore}/100`);
  
  // 詳細比較
  console.error('\n詳細比較:');
  console.error(`目標文字数達成: Gemini ${result.gemini.metrics.isWithinTargetLength ? '✓' : '✗'} / Claude ${result.claude.metrics.isWithinTargetLength ? '✓' : '✗'}`);
  console.error(`句点終了: Gemini ${result.gemini.metrics.hasProperPunctuation ? '✓' : '✗'} / Claude ${result.claude.metrics.hasProperPunctuation ? '✓' : '✗'}`);
  console.error(`タグ数: Gemini ${result.gemini.metrics.tagCount} / Claude ${result.claude.metrics.tagCount}`);
}

// 品質スコア計算
function calculateQualityScore(metrics: QualityMetrics): number {
  let score = 0;
  
  // 文字数評価（40点）
  if (metrics.isWithinTargetLength) {
    score += 40;
  } else if (metrics.summaryLength >= 50 && metrics.summaryLength <= 90) {
    score += 20;
  }
  
  // 句点評価（20点）
  if (metrics.hasProperPunctuation) {
    score += 20;
  }
  
  // タグ数評価（20点）
  if (metrics.tagCount >= 3 && metrics.tagCount <= 5) {
    score += 20;
  } else if (metrics.tagCount >= 2 && metrics.tagCount <= 6) {
    score += 10;
  }
  
  // 詳細要約評価（20点）
  if (metrics.detailedSummaryLength >= 100) {
    score += 20;
  } else if (metrics.detailedSummaryLength >= 50) {
    score += 10;
  }
  
  return score;
}

// メイン処理
async function main() {
  console.error('🔍 要約品質比較ツール');
  console.error('=====================\n');
  
  try {
    // 比較対象の記事を選択
    const limitStr = await askQuestion('比較する記事数を入力してください (デフォルト: 3): ');
    const limit = parseInt(limitStr) || 3;
    
    // 最新の記事を取得
    const articles = await prisma.article.findMany({
      include: { source: true, tags: true },
      orderBy: { publishedAt: 'desc' },
      take: limit
    });
    
    if (articles.length === 0) {
      console.error('記事が見つかりません');
      return;
    }
    
    console.error(`\n${articles.length}件の記事で比較を開始します...\n`);
    
    const results: ComparisonResult[] = [];
    
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      console.error(`\n[${i + 1}/${articles.length}] ${article.title}`);
      
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
      
      // Gemini生成
      console.error('\nGeminiで生成中...');
      try {
        const geminiResult = await generateWithGemini(article.title, content);
        result.gemini = geminiResult;
      } catch (error) {
        result.gemini.error = error instanceof Error ? error.message : String(error);
        console.error('Geminiエラー:', result.gemini.error);
      }
      
      // Claude生成
      console.error('\nClaudeで生成します:');
      try {
        const claudeResult = await generateWithClaude(article.title, content);
        result.claude = claudeResult;
      } catch (error) {
        result.claude.error = error instanceof Error ? error.message : String(error);
        console.error('Claudeエラー:', result.claude.error);
      }
      
      results.push(result);
      displayComparison(result);
    }
    
    // 総合結果
    console.error('\n' + '='.repeat(80));
    console.error('総合結果');
    console.error('='.repeat(80));
    
    let geminiTotalScore = 0;
    let claudeTotalScore = 0;
    
    results.forEach((result) => {
      if (!result.gemini.error) {
        geminiTotalScore += calculateQualityScore(result.gemini.metrics);
      }
      if (!result.claude.error) {
        claudeTotalScore += calculateQualityScore(result.claude.metrics);
      }
    });
    
    console.error(`\nGemini 平均スコア: ${Math.round(geminiTotalScore / results.length)}/100`);
    console.error(`Claude 平均スコア: ${Math.round(claudeTotalScore / results.length)}/100`);
    
    if (claudeTotalScore > geminiTotalScore) {
      console.error('\n✨ Claudeの品質が優れています！');
    } else if (geminiTotalScore > claudeTotalScore) {
      console.error('\n📊 Geminiの品質が優れています。');
    } else {
      console.error('\n🤝 両者は同等の品質です。');
    }
    
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
#!/usr/bin/env npx tsx
/**
 * 重複した要約を持つ記事の修復スクリプト
 * 一覧要約と詳細要約が同じ内容になっている記事を再生成
 */

import { PrismaClient } from '@prisma/client';
import { generateUnifiedPrompt } from '@/lib/utils/article-type-prompts';
import { parseUnifiedResponse, validateParsedResult } from '@/lib/ai/unified-summary-parser';
import { checkSummaryQuality } from '@/lib/utils/summary-quality-checker';

const prisma = new PrismaClient();

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callGeminiAPI(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

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
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as any;
  return data.candidates[0].content.parts[0].text.trim();
}

async function fixDuplicateSummaries() {
  console.error('🔍 重複要約を持つ記事を検索中...\n');

  // 影響を受けた記事を特定
  const affectedArticles = await prisma.$queryRaw<Array<{
    id: string;
    title: string;
    content: string | null;
    summary: string | null;
    detailedSummary: string | null;
    sourceName: string;
  }>>`
    SELECT 
      a.id,
      a.title,
      a.content,
      a.summary,
      a.detailedSummary,
      s.name as sourceName
    FROM "Article" a
    JOIN "Source" s ON a."sourceId" = s.id
    WHERE 
      a."summaryVersion" = 5
      AND substr(a."summary", 1, 100) = substr(a."detailedSummary", 1, 100)
      AND length(a."summary") >= 100
    ORDER BY a."publishedAt" DESC
  `;

  if (affectedArticles.length === 0) {
    console.error('✅ 重複要約を持つ記事はありません');
    return;
  }

  console.error(`📊 影響を受けた記事: ${affectedArticles.length}件\n`);

  let fixedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < affectedArticles.length; i++) {
    const article = affectedArticles[i];
    console.error(`\n[${i + 1}/${affectedArticles.length}] 処理中: ${article.title.substring(0, 50)}...`);
    console.error(`  ソース: ${article.sourceName}`);
    
    // 現在の要約を表示
    console.error(`  現在の要約（最初の50文字）: ${article.summary?.substring(0, 50)}...`);
    console.error(`  現在の詳細要約（最初の50文字）: ${article.detailedSummary?.substring(0, 50)}...`);
    
    const content = article.content || article.title;
    
    try {
      // 新しい要約を生成
      const prompt = generateUnifiedPrompt(article.title, content);
      console.error('  🤖 Gemini APIを呼び出し中...');
      
      const responseText = await callGeminiAPI(prompt);
      const parsed = parseUnifiedResponse(responseText);
      
      // デバッグ情報
      if (process.env.DEBUG_SUMMARIES === 'true') {
        console.error('\n  === デバッグ情報 ===');
        console.error('  新しい要約（最初の50文字）:', parsed.summary.substring(0, 50));
        console.error('  新しい詳細要約（最初の50文字）:', parsed.detailedSummary.substring(0, 50));
        console.error('  重複？:', parsed.summary === parsed.detailedSummary);
      }
      
      // 品質チェック
      const qualityCheck = checkSummaryQuality(parsed.summary, parsed.detailedSummary);
      console.error(`  📊 品質スコア: ${qualityCheck.score}/100`);
      
      // 重複チェック
      const isDuplicate = qualityCheck.issues.some(issue => issue.type === 'duplicate');
      if (isDuplicate) {
        console.error('  ⚠️ 再生成後も重複が検出されました。スキップします。');
        errorCount++;
        continue;
      }
      
      // データベース更新
      await prisma.article.update({
        where: { id: article.id },
        data: {
          summary: parsed.summary,
          detailedSummary: parsed.detailedSummary,
          summaryVersion: 5,
          articleType: 'unified'
        }
      });
      
      console.error('  ✅ 修正完了');
      fixedCount++;
      
      // APIレート制限対策
      if (i < affectedArticles.length - 1) {
        console.error('  ⏳ 5秒待機中...');
        await sleep(5000);
      }
      
    } catch (error) {
      console.error('  ❌ エラー:', error instanceof Error ? error.message : String(error));
      errorCount++;
      
      // エラー時も待機
      if (i < affectedArticles.length - 1) {
        await sleep(5000);
      }
    }
  }

  // 結果レポート
  console.error('\n========================================');
  console.error('📈 修復結果:');
  console.error(`  成功: ${fixedCount}件`);
  console.error(`  失敗: ${errorCount}件`);
  console.error('========================================\n');
  
  // 再確認
  const remainingDuplicates = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*) as count
    FROM "Article"
    WHERE 
      "summaryVersion" = 5
      AND substr("summary", 1, 100) = substr("detailedSummary", 1, 100)
      AND length("summary") >= 100
  `;
  
  const remaining = remainingDuplicates[0]?.count || 0;
  if (remaining > 0) {
    console.error(`⚠️ まだ ${remaining} 件の重複要約が残っています`);
  } else {
    console.error('✅ すべての重複要約が修正されました');
  }
}

// メイン実行
if (require.main === module) {
  fixDuplicateSummaries()
    .then(() => {
      console.error('\n✨ 処理完了');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ エラー:', error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}

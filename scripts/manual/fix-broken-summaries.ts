#!/usr/bin/env npx tsx
/**
 * 壊れた要約を修正するスクリプト
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import { generateUnifiedPrompt } from '@/lib/utils/article/article-type-prompts';
import { UnifiedSummaryService } from '@/lib/ai/unified-summary-service';

const prisma = createPrismaClient();

async function fixBrokenSummaries() {
  const brokenArticleIds = [
    'cme5oz3hj0001teo136ukuvqk',
    'cme5oz4xs0003teo1ni3vfoa6',
    'cme5oz4ye0005teo1h67kg9xu',
    'cme5oz4za0007teo1a1uw8wrv',
    'cme5oz50h0009teo1z25ieabl',
    'cme5oz51n000bteo1f9907k7k'
  ];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const unifiedSummaryService = new UnifiedSummaryService();

  console.error(`📝 ${brokenArticleIds.length}件の壊れた要約を修正します`);

  for (const articleId of brokenArticleIds) {
    console.error(`\n処理中: ${articleId}`);
    
    try {
      const article = await prisma.article.findUnique({
        where: { id: articleId },
        include: { source: true }
      });

      if (!article) {
        console.error(`  ❌ 記事が見つかりません`);
        continue;
      }

      console.error(`  📰 ${article.title.substring(0, 50)}...`);
      
      const prompt = generateUnifiedPrompt(
        article.title,
        article.content || ''
      );

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
        console.error(`  ❌ APIエラー: ${response.status}`);
        continue;
      }

      const data = await response.json() as any;
      const responseText = data.candidates[0].content.parts[0].text.trim();
      
      const result = unifiedSummaryService.parseResponse(responseText);
      
      await prisma.article.update({
        where: { id: articleId },
        data: {
          summary: result.summary,
          detailedSummary: result.detailedSummary,
          articleType: 'unified',
          summaryVersion: 5
        }
      });

      console.error(`  ✅ 修正完了`);
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error(`  ❌ エラー: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.error('\n✅ すべての修正が完了しました');
}

fixBrokenSummaries()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
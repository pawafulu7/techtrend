#!/usr/bin/env npx tsx
/**
 * 特定の2記事の要約を統一フォーマットで再生成
 * 共通処理（generateUnifiedPrompt, UnifiedSummaryService）を使用
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import { generateUnifiedPrompt } from '@/lib/utils/article/article-type-prompts';
import { UnifiedSummaryService } from '@/lib/ai/unified-summary-service';

const prisma = createPrismaClient();

async function regenerateTwoArticles() {
  const articleIds = [
    'cme5mu08l000etecq13hr77jw', // Cybozu MySQL on Kubernetes
    'cme5mtynf0001tecqgfvlk8ru'  // Svelte5でJSライブラリを作成
  ];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const unifiedSummaryService = new UnifiedSummaryService();

  for (const articleId of articleIds) {
    console.error(`\n📝 処理中: ${articleId}`);
    
    try {
      // 記事を取得
      const article = await prisma.article.findUnique({
        where: { id: articleId },
        include: { source: true }
      });

      if (!article) {
        console.error(`  ❌ 記事が見つかりません: ${articleId}`);
        continue;
      }

      const titlePreview = article.title.length > 60 
        ? article.title.substring(0, 60) + '...' 
        : article.title;
      console.error(`  📰 タイトル: ${titlePreview}`);
      console.error(`  📚 ソース: ${article.source.name}`);
      
      // コンテンツ確認
      const content = article.content || '';
      console.error(`  📄 コンテンツ長: ${content.length}文字`);
      if (content.length < 500) {
        console.error(`  ⚠️  警告: コンテンツが短すぎます`);
        console.error(`     内容: ${content.substring(0, 200)}`);
      }
      
      // 統一プロンプトを生成（共通処理）
      const prompt = generateUnifiedPrompt(
        article.title,
        content
      );

      console.error('  🔄 Gemini APIリクエスト送信中...');
      
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
            maxOutputTokens: 2500, // 詳細要約が800-1000文字なので余裕を持たせる
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`  ❌ APIエラー: ${response.status}`);
        console.error(`     ${error.substring(0, 200)}`);
        continue;
      }

      const data = await response.json() as any;
      const responseText = data.candidates[0].content.parts[0].text.trim();
      
      // デバッグ: API応答を表示
      console.error(`  📝 APIレスポンス長: ${responseText.length}文字`);
      if (articleId === 'cme5mu08l000etecq13hr77jw') {
        console.error(`  🔍 Cybozu記事のAPI応答（最初の1000文字）:`);
        console.error(responseText.substring(0, 1000));
      }
      
      // 統一サービスでパース（共通処理）
      const result = unifiedSummaryService.parseResponse(responseText);
      
      console.error(`  📊 生成結果:`);
      console.error(`     一覧要約: ${result.summary.length}文字`);
      console.error(`     詳細要約: ${result.detailedSummary.length}文字`);
      console.error(`     タグ: ${result.tags.join(', ')}`);

      // データベース更新
      await prisma.article.update({
        where: { id: articleId },
        data: {
          summary: result.summary,
          detailedSummary: result.detailedSummary,
          articleType: 'unified',
          summaryVersion: 5
        }
      });

      // タグの更新
      if (result.tags && result.tags.length > 0) {
        const tagRecords = await Promise.all(
          result.tags.map(async (tagName) => {
            return await prisma.tag.upsert({
              where: { name: tagName },
              update: {},
              create: { name: tagName }
            });
          })
        );

        await prisma.article.update({
          where: { id: articleId },
          data: {
            tags: {
              set: tagRecords.map(tag => ({ id: tag.id }))
            }
          }
        });
        console.error(`  🏷️  タグ更新完了`);
      }

      console.error(`  ✅ 記事の要約再生成完了`);
      
      // API レート制限対策
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error(`  ❌ エラー: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.error('\n✨ すべての記事の再生成が完了しました');
}



// メイン処理
regenerateTwoArticles()
  .then(() => {
    console.error('🎉 処理完了');
  })
  .catch((error) => {
    console.error('💥 致命的エラー:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
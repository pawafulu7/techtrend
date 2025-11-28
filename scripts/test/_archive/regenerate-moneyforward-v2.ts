#!/usr/bin/env -S npx tsx

import { PrismaClient } from '@prisma/client';
import { GeminiClient } from '../../lib/ai/gemini';
import { generateUnifiedPrompt } from '../../lib/utils/article-type-prompts';
import { postProcessSummaries } from '../../lib/utils/summary-post-processor';

const prisma = new PrismaClient();

async function regenerateWithNewFormat() {
  console.error('🔄 マネーフォワード記事の要約を新形式で再生成\n');

  // 本番DBでの誤実行防止ガード
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (process.env.NODE_ENV === 'production' || 
      /prod|production/i.test(dbUrl)) {
    console.error('❌ 本番環境では実行できません');
    console.error('DATABASE_URL/NODE_ENV を確認してください');
    process.exit(2);
  }

  const articleId = 'cmebj56760006texkokzz8exg';
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  try {
    // 1. 記事を取得
    const article = await prisma.article.findUnique({
      where: { id: articleId }
    });

    if (!article || !article.content) {
      throw new Error('記事またはコンテンツが見つかりません');
    }

    console.error('📄 記事情報:');
    console.error(`  タイトル: ${article.title}`);
    console.error(`  コンテンツ長: ${article.content.length}文字\n`);

    // 2. Geminiクライアントを初期化
    const gemini = new GeminiClient(apiKey);

    // 3. 統一プロンプトで要約生成
    console.error('🤖 新形式で要約を生成中...');
    
    // 一覧要約
    const summary = await gemini.generateSummary(article.title, article.content);
    console.error('✅ 一覧要約生成完了');
    
    // 詳細要約（統一プロンプト使用）
    const unifiedPrompt = generateUnifiedPrompt(article.title, article.content);
    const detailedResult = await gemini.generateDetailedSummary(article.title, article.content);
    console.error('✅ 詳細要約生成完了\n');

    const processed = postProcessSummaries(summary, detailedResult.detailedSummary);

    // 詳細要約の形式確認
    console.error('📝 詳細要約プレビュー（最初の500文字）:');
    console.error(processed.detailedSummary.substring(0, 500));
    console.error('...\n');

    // 固定項目が含まれていないか確認
    const hasFixedItems = processed.detailedSummary.includes('主要トピック') || 
                         processed.detailedSummary.includes('課題・問題点') ||
                         processed.detailedSummary.includes('技術的詳細');
    
    if (hasFixedItems) {
      console.error('⚠️ 警告: 固定項目が検出されました。再生成が必要かもしれません。');
    } else {
      console.error('✅ 新形式での生成を確認（固定項目なし）');
    }

    // 4. データベース更新
    console.error('\n💾 データベースを更新中...');
    const updated = await prisma.article.update({
      where: { id: articleId },
      data: {
        summary: processed.summary,
        detailedSummary: processed.detailedSummary,
        summaryVersion: 7, // 最新バージョン
        articleType: 'unified'
      }
    });

    console.error('✅ 更新完了！');
    console.error(`  要約長: ${updated.summary?.length}文字`);
    console.error(`  詳細要約長: ${updated.detailedSummary?.length}文字`);

  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

regenerateWithNewFormat();

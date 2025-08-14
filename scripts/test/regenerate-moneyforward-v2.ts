#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { GeminiClient } from '../../lib/ai/gemini';
import { generateUnifiedPrompt } from '../../lib/utils/article-type-prompts';

const prisma = new PrismaClient();

async function regenerateWithNewFormat() {
  console.log('🔄 マネーフォワード記事の要約を新形式で再生成\n');

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

    console.log('📄 記事情報:');
    console.log(`  タイトル: ${article.title}`);
    console.log(`  コンテンツ長: ${article.content.length}文字\n`);

    // 2. Geminiクライアントを初期化
    const gemini = new GeminiClient(apiKey);

    // 3. 統一プロンプトで要約生成
    console.log('🤖 新形式で要約を生成中...');
    
    // 一覧要約
    const summary = await gemini.generateSummary(article.title, article.content);
    console.log('✅ 一覧要約生成完了');
    
    // 詳細要約（統一プロンプト使用）
    const unifiedPrompt = generateUnifiedPrompt(article.title, article.content);
    const detailedResult = await gemini.generateDetailedSummary(article.title, article.content);
    console.log('✅ 詳細要約生成完了\n');

    const detailedSummary = detailedResult.detailedSummary;

    // 詳細要約の形式確認
    console.log('📝 詳細要約プレビュー（最初の500文字）:');
    console.log(detailedSummary.substring(0, 500));
    console.log('...\n');

    // 固定項目が含まれていないか確認
    const hasFixedItems = detailedSummary.includes('主要トピック') || 
                         detailedSummary.includes('課題・問題点') ||
                         detailedSummary.includes('技術的詳細');
    
    if (hasFixedItems) {
      console.log('⚠️ 警告: 固定項目が検出されました。再生成が必要かもしれません。');
    } else {
      console.log('✅ 新形式での生成を確認（固定項目なし）');
    }

    // 4. データベース更新
    console.log('\n💾 データベースを更新中...');
    const updated = await prisma.article.update({
      where: { id: articleId },
      data: {
        summary,
        detailedSummary,
        summaryVersion: 7, // 最新バージョン
        articleType: 'unified'
      }
    });

    console.log('✅ 更新完了！');
    console.log(`  要約長: ${updated.summary?.length}文字`);
    console.log(`  詳細要約長: ${updated.detailedSummary?.length}文字`);

  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

regenerateWithNewFormat();
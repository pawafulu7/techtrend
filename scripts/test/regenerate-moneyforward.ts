#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { generateSummaryAndTags } from '../../lib/ai/gemini-handler';

const prisma = new PrismaClient();

async function regenerateMoneyForwardSummary() {
  console.log('🔄 マネーフォワード記事の要約再生成\n');

  const articleId = 'cmebj56760006texkokzz8exg';

  try {
    // 1. 記事を取得
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: {
        tags: true,
        source: true
      }
    });

    if (!article) {
      throw new Error('記事が見つかりません');
    }

    console.log('📄 記事情報:');
    console.log(`  タイトル: ${article.title}`);
    console.log(`  コンテンツ長: ${article.content?.length || 0}文字`);
    console.log(`  現在の要約長: ${article.summary?.length || 0}文字`);
    console.log(`  現在の詳細要約長: ${article.detailedSummary?.length || 0}文字\n`);

    if (!article.content || article.content.length < 100) {
      throw new Error('コンテンツが不十分です');
    }

    // 2. 要約を生成
    console.log('🤖 Gemini APIで要約を生成中...');
    const summaryResult = await generateSummaryAndTags(
      article.title,
      article.content,
      article.url
    );

    if (!summaryResult.summary || !summaryResult.detailedSummary) {
      throw new Error('要約生成に失敗しました');
    }

    console.log('\n✅ 新しい要約:');
    console.log(`  一覧要約: ${summaryResult.summary.substring(0, 50)}...`);
    console.log(`  要約長: ${summaryResult.summary.length}文字`);
    console.log(`  詳細要約長: ${summaryResult.detailedSummary.length}文字`);
    console.log(`  タグ: ${summaryResult.tags.join(', ')}\n`);

    // 3. データベース更新
    console.log('💾 データベースを更新中...');
    
    // タグの処理
    const tagOperations = [];
    for (const tagName of summaryResult.tags) {
      const existingTag = await prisma.tag.findUnique({
        where: { name: tagName }
      });
      
      if (existingTag) {
        tagOperations.push({ id: existingTag.id });
      } else {
        tagOperations.push({ name: tagName });
      }
    }

    const updated = await prisma.article.update({
      where: { id: articleId },
      data: {
        summary: summaryResult.summary,
        detailedSummary: summaryResult.detailedSummary,
        summaryVersion: 5, // 最新バージョン
        articleType: 'unified',
        tags: {
          set: [], // 既存のタグをクリア
          connect: tagOperations.filter(op => op.id).map(op => ({ id: op.id })),
          create: tagOperations.filter(op => op.name).map(op => ({ name: op.name }))
        }
      }
    });

    console.log('✅ 更新完了！');
    console.log(`  新要約長: ${updated.summary?.length}文字`);
    console.log(`  新詳細要約長: ${updated.detailedSummary?.length}文字`);

  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

regenerateMoneyForwardSummary();
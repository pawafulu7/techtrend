#!/usr/bin/env npx tsx
/**
 * 詳細要約のMarkdown太字記法（**）を削除するスクリプト
 * 
 * 背景：
 * 2025年8月中旬頃から、Gemini APIが詳細要約生成時にMarkdown太字記法を含むレスポンスを返すようになり、
 * 「・**項目名:**」のような形式で保存されてしまう問題が発生。
 * パーサー（lib/ai/unified-summary-parser.ts）は既に修正済みだが、
 * 既存データには修正が適用されていない。
 * 
 * 対象：
 * - summaryVersion: 8の記事
 * - detailedSummaryに「・**」を含む記事
 * - 2025年8月16日〜26日に作成された22件の記事
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixDetailedSummaryMarkdown() {
  console.log('=== 詳細要約のMarkdown太字記法修正スクリプト ===\n');
  
  try {
    // 対象記事を確認
    console.log('1. 影響を受けた記事を検索中...');
    const affectedArticles = await prisma.article.findMany({
      where: {
        detailedSummary: {
          contains: '・**'
        }
      },
      select: {
        id: true,
        title: true,
        detailedSummary: true,
        summaryVersion: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`\n影響を受けた記事数: ${affectedArticles.length}件\n`);

    if (affectedArticles.length === 0) {
      console.log('修正が必要な記事はありません。');
      return;
    }

    // 記事一覧を表示
    console.log('対象記事一覧:');
    affectedArticles.forEach((article, index) => {
      const preview = article.detailedSummary?.substring(0, 50) || '';
      console.log(`${index + 1}. [${article.id}] ${article.title}`);
      console.log(`   作成日: ${article.createdAt.toISOString()}`);
      console.log(`   要約プレビュー: ${preview}...`);
    });

    // ユーザーに確認
    console.log('\n=== 修正内容 ===');
    console.log('以下の置換を実行します:');
    console.log('1. 「・**項目名:**」→「・項目名:」');
    console.log('2. その他の「**テキスト**」→「テキスト」');

    // 修正を実行
    console.log('\n2. 修正を実行中...');
    let successCount = 0;
    let errorCount = 0;

    for (const article of affectedArticles) {
      try {
        if (!article.detailedSummary) continue;

        // Markdown太字記法を削除
        let fixedSummary = article.detailedSummary;
        
        // パターン1: 「・**項目名:**」形式を修正
        fixedSummary = fixedSummary.replace(/・\*\*([^*]+):\*\*/g, '・$1:');
        
        // パターン2: その他の太字記法を削除
        fixedSummary = fixedSummary.replace(/\*\*([^*]+)\*\*/g, '$1');

        // データベースを更新
        await prisma.article.update({
          where: { id: article.id },
          data: { detailedSummary: fixedSummary }
        });

        console.log(`✓ 修正完了: ${article.title}`);
        successCount++;
      } catch (error) {
        console.error(`✗ エラー: ${article.title}`, error);
        errorCount++;
      }
    }

    // 結果を表示
    console.log('\n=== 修正結果 ===');
    console.log(`成功: ${successCount}件`);
    console.log(`失敗: ${errorCount}件`);

    // 修正後の確認
    console.log('\n3. 修正後の確認...');
    const remainingIssues = await prisma.article.count({
      where: {
        detailedSummary: {
          contains: '・**'
        }
      }
    });

    if (remainingIssues === 0) {
      console.log('✓ すべての記事が正常に修正されました。');
    } else {
      console.log(`⚠ まだ${remainingIssues}件の記事に問題が残っています。`);
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// スクリプトを実行
fixDetailedSummaryMarkdown().catch(console.error);
#!/usr/bin/env -S tsx
/**
 * 柔軟な項目設定による要約生成のテストスクリプト
 * Usage: npx tsx scripts/test/test-flexible-summary.ts [articleId]
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();

async function testFlexibleSummary(articleId?: string) {
  try {
    // テスト対象の記事を取得
    const targetId = articleId || 'cmea7xach000mten85wz32hra'; // GPT-5記事をデフォルト
    
    const article = await prisma.article.findUnique({
      where: { id: targetId }
    });

    if (!article) {
      console.error(`記事が見つかりません: ${targetId}`);
      return;
    }

    console.error('\n========================================');
    console.error('テスト対象記事');
    console.error('========================================');
    console.error(`タイトル: ${article.title}`);
    console.error(`URL: ${article.url}`);
    console.error(`現在のsummaryVersion: ${article.summaryVersion}`);
    console.error(`現在の詳細要約文字数: ${article.detailedSummary?.length || 0}文字`);
    
    if (article.detailedSummary) {
      console.error('\n【現在の詳細要約】');
      console.error(article.detailedSummary);
    }

    // 新しいプロンプトで要約を生成
    console.error('\n========================================');
    console.error('新プロンプトで要約生成中...');
    console.error('========================================');
    
    const service = new UnifiedSummaryService();
    const result = await service.generate(
      article.title,
      article.content || '',
      undefined,
      { sourceName: article.source, url: article.url }
    );

    console.error('\n【生成結果】');
    console.error(`summaryVersion: ${result.summaryVersion}`);
    console.error(`品質スコア: ${result.qualityScore}`);
    
    console.error('\n【一覧要約】');
    console.error(`文字数: ${result.summary.length}文字`);
    console.error(result.summary);
    
    console.error('\n【詳細要約】');
    console.error(`文字数: ${result.detailedSummary.length}文字`);
    console.error(result.detailedSummary);
    
    console.error('\n【タグ】');
    console.error(result.tags.join(', '));
    
    // 改善の分析
    console.error('\n========================================');
    console.error('改善分析');
    console.error('========================================');
    
    const oldLength = article.detailedSummary?.length || 0;
    const newLength = result.detailedSummary.length;
    const improvement = ((newLength - oldLength) / oldLength * 100).toFixed(1);
    
    console.error(`詳細要約の文字数変化: ${oldLength}文字 → ${newLength}文字 (${improvement}%)`);
    
    // 項目形式の確認
    const lines = result.detailedSummary.split('\n').filter(line => line.trim());
    const itemCount = lines.filter(line => line.startsWith('・')).length;
    console.error(`箇条書き項目数: ${itemCount}個`);
    
    // 項目名の抽出
    console.error('\n【項目名一覧】');
    lines.filter(line => line.startsWith('・')).forEach(line => {
      const itemName = line.split('：')[0].replace('・', '').trim();
      console.error(`- ${itemName}`);
    });
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
const articleId = process.argv[2];
testFlexibleSummary(articleId);
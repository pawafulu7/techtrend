#!/usr/bin/env npx tsx
/**
 * 9000文字の記事でsummaryVersion 7のテスト
 * 改善されたプロンプトで5項目生成されるか確認
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import { parseSummary } from '../../lib/utils/summary-parser';

const prisma = new PrismaClient();

async function test9kArticle() {
  console.error('========================================');
  console.error('9000文字記事のsummaryVersion 7テスト');
  console.error('========================================\n');

  try {
    // 対象記事の取得
    const article = await prisma.article.findUnique({
      where: { id: 'cmdq3y8fd0001te564aqst93r' },
      select: {
        id: true,
        title: true,
        content: true,
        url: true,
        sourceId: true,
        summaryVersion: true,
        detailedSummary: true
      }
    });

    if (!article) {
      console.error('❌ 記事が見つかりません');
      return;
    }

    console.error('【記事情報】');
    console.error(`タイトル: ${article.title}`);
    console.error(`文字数: ${article.content?.length || 0}文字`);
    console.error(`現在のsummaryVersion: ${article.summaryVersion}`);
    console.error();

    // 現在の詳細要約を解析
    if (article.detailedSummary && article.summaryVersion === 7) {
      console.error('【現在の詳細要約】');
      const currentSections = parseSummary(article.detailedSummary, { 
        summaryVersion: 7 
      });
      console.error(`項目数: ${currentSections.length}個`);
      currentSections.forEach((section, i) => {
        console.error(`  ${i+1}. ${section.icon} ${section.title}`);
      });
      console.error();
    }

    // 新しいプロンプトで再生成
    console.error('【改善版プロンプトで再生成】');
    const service = new UnifiedSummaryService();
    
    console.error('生成中...');
    const result = await service.generate(
      article.title,
      article.content || '',
      undefined,
      { sourceName: article.sourceId, url: article.url }
    );

    console.error(`✅ 生成完了`);
    console.error(`summaryVersion: ${result.summaryVersion}`);
    console.error(`品質スコア: ${result.qualityScore}`);
    console.error();

    // 新しい詳細要約を解析
    console.error('【新しい詳細要約】');
    const newSections = parseSummary(result.detailedSummary, { 
      summaryVersion: result.summaryVersion 
    });
    
    console.error(`項目数: ${newSections.length}個 ${newSections.length === 5 ? '✅' : '⚠️'}`);
    newSections.forEach((section, i) => {
      console.error(`  ${i+1}. ${section.icon} ${section.title}`);
      console.error(`     ${section.content.substring(0, 80)}...`);
    });
    console.error();

    // 文字数比較
    console.error('【文字数比較】');
    console.error(`現在の詳細要約: ${article.detailedSummary?.length || 0}文字`);
    console.error(`新しい詳細要約: ${result.detailedSummary.length}文字`);
    console.error();

    // 詳細要約の全文
    console.error('【新しい詳細要約（全文）】');
    console.error('----------------------------------------');
    console.error(result.detailedSummary);
    console.error('----------------------------------------');

    // 結果判定
    console.error('\n【判定】');
    if (newSections.length === 5) {
      console.error('✅ 成功: 9000文字の記事で5項目生成されました');
    } else {
      console.error(`⚠️ 注意: ${newSections.length}項目のみ生成（期待値: 5項目）`);
    }

  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
test9kArticle();
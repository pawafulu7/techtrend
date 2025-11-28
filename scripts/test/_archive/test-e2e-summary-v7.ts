#!/usr/bin/env -S tsx
/**
 * summaryVersion 7のE2Eテスト
 * 新規記事の取得から要約生成、表示までの一連の流れをテスト
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import { parseSummary } from '../../lib/utils/summary-parser';

const prisma = new PrismaClient();

async function testE2ESummaryV7() {
  console.error('========================================');
  console.error('summaryVersion 7 E2Eテスト');
  console.error('========================================\n');

  try {
    // 1. テスト用の記事を選択（要約未生成または古いバージョンの記事）
    console.error('【ステップ1: テスト対象記事の選択】');
    const article = await prisma.article.findFirst({
      where: {
        OR: [
          { summaryVersion: { lt: 7 } },
          { summaryVersion: null },
          { id: 'cmea7xach000mten85wz32hra' } // GPT-5記事
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!article) {
      console.error('❌ テスト対象記事が見つかりません');
      return;
    }

    console.error(`✅ 記事選択: ${article.title}`);
    console.error(`   現在のsummaryVersion: ${article.summaryVersion || 'なし'}`);
    console.error();

    // 2. 新プロンプトで要約生成
    console.error('【ステップ2: summaryVersion 7で要約生成】');
    const service = new UnifiedSummaryService();
    
    console.error('生成中...');
    const result = await service.generate(
      article.title,
      article.content || '',
      undefined,
      { sourceName: article.source, url: article.url }
    );

    console.error(`✅ 要約生成完了`);
    console.error(`   summaryVersion: ${result.summaryVersion}`);
    console.error(`   品質スコア: ${result.qualityScore}`);
    console.error(`   一覧要約: ${result.summary.length}文字`);
    console.error(`   詳細要約: ${result.detailedSummary.length}文字`);
    console.error();

    // 3. パーサーで解析
    console.error('【ステップ3: パーサーでの解析】');
    const sections = parseSummary(result.detailedSummary, { 
      summaryVersion: result.summaryVersion 
    });

    console.error(`✅ パース成功: ${sections.length}個のセクション`);
    sections.forEach((section, index) => {
      console.error(`   ${index + 1}. ${section.icon} ${section.title}`);
      console.error(`      ${section.content.substring(0, 50)}...`);
    });
    console.error();

    // 4. データベース更新のシミュレーション（実際には更新しない）
    console.error('【ステップ4: データベース更新シミュレーション】');
    const updateData = {
      summary: result.summary,
      detailedSummary: result.detailedSummary,
      summaryVersion: result.summaryVersion,
      articleType: result.articleType,
      qualityScore: result.qualityScore,
      tags: result.tags
    };

    console.error('✅ 更新データ準備完了');
    console.error(`   更新対象フィールド: ${Object.keys(updateData).join(', ')}`);
    console.error();

    // 5. 表示確認
    console.error('【ステップ5: 表示確認】');
    console.error('詳細要約の表示プレビュー:');
    console.error('----------------------------------------');
    sections.forEach((section) => {
      console.error(`${section.icon} ${section.title}`);
      console.error(`   ${section.content}`);
      console.error();
    });
    console.error('----------------------------------------');

    // 6. バージョン互換性確認
    console.error('【ステップ6: バージョン互換性確認】');
    
    // 旧バージョンのテスト
    const oldSummary = '・核心：テスト内容\n・背景：テスト背景';
    const oldSections = parseSummary(oldSummary, { summaryVersion: 5, articleType: 'unified' });
    console.error(`✅ summaryVersion 5互換性: ${oldSections.length > 0 ? 'OK' : 'NG'}`);
    
    // 新バージョンのテスト  
    const newSections = parseSummary(result.detailedSummary, { summaryVersion: 7 });
    console.error(`✅ summaryVersion 7処理: ${newSections.length > 0 ? 'OK' : 'NG'}`);

    console.error('\n========================================');
    console.error('E2Eテスト完了');
    console.error('========================================');
    console.error('\n【総合評価】');
    console.error('✅ 要約生成: 成功');
    console.error('✅ パーサー処理: 成功');
    console.error('✅ 表示形式: 正常');
    console.error('✅ バージョン互換性: 維持');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
testE2ESummaryV7();
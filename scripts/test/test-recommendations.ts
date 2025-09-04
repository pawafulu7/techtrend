#!/usr/bin/env -S npx tsx

/**
 * 推薦機能のテストスクリプト
 */

import { prisma } from '../../lib/prisma';
import { recommendationService } from '../../lib/recommendation/recommendation-service';

async function testRecommendations() {
  try {
    console.error('推薦機能のテストを開始します...\n');

    // テストユーザーを取得
    const user = await prisma.user.findFirst({
      where: { email: 'test@example.com' }
    });

    if (!user) {
      throw new Error('テストユーザーが見つかりません');
    }

    console.error(`ユーザー: ${user.email} (ID: ${user.id})`);

    // ユーザーの興味を分析
    console.error('\n1. ユーザーの興味分析...');
    const interests = await recommendationService.getUserInterests(user.id);
    
    if (interests) {
      console.error(`  - タグスコア数: ${interests.tagScores.size}`);
      console.error(`  - 総アクション数: ${interests.totalActions}`);
      console.error(`  - 最終更新: ${interests.lastUpdated}`);
      
      // 上位5つのタグを表示
      const topTags = Array.from(interests.tagScores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      console.error('  - 上位タグ:');
      topTags.forEach(([tag, score]) => {
        console.error(`    ${tag}: ${score.toFixed(2)}`);
      });
    } else {
      console.error('  興味データなし（新規ユーザー）');
    }

    // 推薦記事を取得
    console.error('\n2. 推薦記事の取得...');
    const recommendations = await recommendationService.getRecommendations(user.id, 10);
    
    console.error(`  - 推薦記事数: ${recommendations.length}`);
    
    if (recommendations.length > 0) {
      console.error('\n推薦記事リスト:');
      recommendations.forEach((article, index) => {
        console.error(`\n${index + 1}. ${article.title}`);
        console.error(`   ソース: ${article.sourceName}`);
        console.error(`   スコア: ${(article.recommendationScore * 100).toFixed(1)}%`);
        console.error(`   理由: ${article.recommendationReasons.join(', ')}`);
        console.error(`   タグ: ${article.tags.slice(0, 5).join(', ')}`);
      });
    }

    // 新規ユーザー向けデフォルト推薦をテスト
    console.error('\n3. デフォルト推薦のテスト...');
    const defaultRecommendations = await recommendationService.getDefaultRecommendations(5);
    console.error(`  - デフォルト推薦数: ${defaultRecommendations.length}`);

    console.error('\n✅ テスト完了');
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
testRecommendations()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ 異常終了:', err);
    process.exit(1);
  });

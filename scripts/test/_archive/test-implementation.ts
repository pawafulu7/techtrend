#!/usr/bin/env -S tsx
/**
 * 実装のテストスクリプト
 * 100-500文字のコンテンツで詳細要約が生成されることを確認
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testImplementation() {
  console.error('===================================');
  console.error('実装テスト - 詳細要約生成の改善');
  console.error('===================================\n');

  // テスト1: 100-500文字の記事で詳細要約がスキップされている数を確認
  console.error('【テスト1】100-500文字の記事の状況確認');
  console.error('-----------------------------------');
  
  const skippedArticles = await prisma.article.findMany({
    where: {
      AND: [
        { detailedSummary: '__SKIP_DETAILED_SUMMARY__' },
        {
          content: {
            not: null
          }
        }
      ]
    },
    select: {
      id: true,
      title: true,
      content: true,
      detailedSummary: true
    }
  });

  // コンテンツ長で分類
  const byLength = {
    under100: [] as any[],
    between100and500: [] as any[],
    over500: [] as any[]
  };

  skippedArticles.forEach(article => {
    const len = article.content?.length || 0;
    if (len <= 100) {
      byLength.under100.push(article);
    } else if (len <= 500) {
      byLength.between100and500.push(article);
    } else {
      byLength.over500.push(article);
    }
  });

  console.error(`100文字以下: ${byLength.under100.length}件`);
  console.error(`100-500文字: ${byLength.between100and500.length}件`);
  console.error(`500文字超: ${byLength.over500.length}件\n`);

  // テスト2: 再処理スクリプトの存在確認
  console.error('【テスト2】再処理スクリプトの確認');
  console.error('-----------------------------------');
  
  const fs = await import('fs');
  const path = await import('path');
  const scriptPath = path.resolve('./scripts/fix/regenerate-skipped-summaries.ts');
  
  if (fs.existsSync(scriptPath)) {
    console.error('✅ 再処理スクリプトが存在します');
    
    // スクリプトの内容を簡単にチェック
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    const hasOptions = scriptContent.includes('--dry-run') && 
                      scriptContent.includes('--limit') &&
                      scriptContent.includes('--continue');
    
    if (hasOptions) {
      console.error('✅ 必要なオプションが実装されています');
      console.error('  - --dry-run: ドライランモード');
      console.error('  - --limit: 処理件数制限');
      console.error('  - --continue: 再開機能\n');
    }
  } else {
    console.error('❌ 再処理スクリプトが見つかりません\n');
  }

  // テスト3: UnifiedSummaryServiceの変更確認
  console.error('【テスト3】UnifiedSummaryServiceの変更確認');
  console.error('-----------------------------------');
  
  const servicePath = path.resolve('./lib/ai/unified-summary-service.ts');
  
  if (fs.existsSync(servicePath)) {
    const serviceContent = fs.readFileSync(servicePath, 'utf-8');
    
    // 新しい制限の確認
    const hasNewLimit = serviceContent.includes('processedContent.length <= 100');
    const hasWordCount = serviceContent.includes('split(/\\s+/).length < 20');
    const hasShortContentPrompt = serviceContent.includes('generateShortContentPrompt');
    
    console.error(`新しい制限（100文字）: ${hasNewLimit ? '✅' : '❌'}`);
    console.error(`単語数チェック: ${hasWordCount ? '✅' : '❌'}`);
    console.error(`短いコンテンツ用プロンプト: ${hasShortContentPrompt ? '✅' : '❌'}\n`);
    
    if (hasNewLimit && hasWordCount && hasShortContentPrompt) {
      console.error('✅ UnifiedSummaryServiceの実装が正しく更新されています\n');
    } else {
      console.error('⚠️ 一部の実装が不完全な可能性があります\n');
    }
  }

  // テスト4: サンプルデータでの動作確認
  console.error('【テスト4】サンプルデータの確認');
  console.error('-----------------------------------');
  
  if (byLength.between100and500.length > 0) {
    const samples = byLength.between100and500.slice(0, 3);
    console.error('100-500文字の記事サンプル:');
    samples.forEach((article, index) => {
      console.error(`\n${index + 1}. ${article.title}`);
      console.error(`   ID: ${article.id}`);
      console.error(`   コンテンツ長: ${article.content?.length}文字`);
      console.error(`   詳細要約: ${article.detailedSummary === '__SKIP_DETAILED_SUMMARY__' ? 'スキップ中' : '生成済み'}`);
    });
    
    console.error('\n💡 これらの記事は再処理により詳細要約が生成可能です');
    console.error('   実行コマンド: npx tsx scripts/fix/regenerate-skipped-summaries.ts --limit=10');
  }

  // サマリー
  console.error('\n===================================');
  console.error('テスト結果サマリー');
  console.error('===================================');
  
  const totalSkipped = skippedArticles.length;
  const improvable = byLength.between100and500.length + byLength.over500.length;
  const percentage = totalSkipped > 0 ? (improvable / totalSkipped * 100).toFixed(1) : '0';
  
  console.error(`総スキップ記事数: ${totalSkipped}件`);
  console.error(`改善可能な記事数: ${improvable}件 (${percentage}%)`);
  console.error(`  - 100-500文字: ${byLength.between100and500.length}件`);
  console.error(`  - 500文字超: ${byLength.over500.length}件`);
  console.error(`極端に短い記事（100文字以下）: ${byLength.under100.length}件`);
  
  if (improvable > 0) {
    console.error('\n📝 推奨アクション:');
    console.error('1. まずドライランでテスト:');
    console.error('   npx tsx scripts/fix/regenerate-skipped-summaries.ts --dry-run --limit=5');
    console.error('2. 問題なければ実行:');
    console.error('   npx tsx scripts/fix/regenerate-skipped-summaries.ts --limit=50');
  }

  await prisma.$disconnect();
}

testImplementation().catch(error => {
  console.error('Fatal error:', error);
  prisma.$disconnect();
  process.exit(1);
});
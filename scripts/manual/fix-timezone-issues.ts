#!/usr/bin/env node

/**
 * 既存記事のタイムゾーン問題を修正するスクリプト
 * createdAt < publishedAtという論理的矛盾がある記事を検出し、修正する
 * 
 * 使用方法:
 * npx tsx scripts/manual/fix-timezone-issues.ts --dry-run  # ドライラン
 * npx tsx scripts/manual/fix-timezone-issues.ts --execute  # 実行
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * データベースのバックアップを作成
 */
async function createBackup(): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const backupPath = path.join('prisma', `dev.db.backup.${timestamp}_before_data_fix`);
  
  console.error(`Creating backup: ${backupPath}`);
  fs.copyFileSync('prisma/dev.db', backupPath);
  
  return backupPath;
}

/**
 * 問題のある記事を検出
 */
async function detectProblematicArticles() {
  // SQLiteでは直接的な日付比較が難しいため、全記事を取得して比較
  const articles = await prisma.article.findMany({
    include: {
      source: true
    },
    orderBy: {
      publishedAt: 'desc'
    }
  });

  const problematicArticles = articles.filter(article => {
    // createdAtがpublishedAtより早い（論理的におかしい）記事を検出
    return article.createdAt < article.publishedAt;
  });

  // ソースごとに集計
  const bySource: Record<string, any[]> = {};
  problematicArticles.forEach(article => {
    const sourceName = article.source.name;
    if (!bySource[sourceName]) {
      bySource[sourceName] = [];
    }
    bySource[sourceName].push({
      id: article.id,
      title: article.title,
      publishedAt: article.publishedAt,
      createdAt: article.createdAt,
      diffHours: (article.createdAt.getTime() - article.publishedAt.getTime()) / (1000 * 60 * 60)
    });
  });

  return { problematicArticles, bySource };
}

/**
 * 記事のタイムゾーン問題を修正
 */
async function fixArticles(articles: any[], dryRun: boolean) {
  if (dryRun) {
    console.error('\n[DRY RUN MODE] 以下の修正を実行します（実際には変更されません）:');
  } else {
    console.error('\n記事を修正しています...');
  }

  let fixedCount = 0;
  
  for (const article of articles) {
    const newPublishedAt = article.createdAt;
    
    console.error(`  - ${article.title.substring(0, 50)}...`);
    console.error(`    旧: ${article.publishedAt.toISOString()}`);
    console.error(`    新: ${newPublishedAt.toISOString()}`);
    
    if (!dryRun) {
      await prisma.article.update({
        where: { id: article.id },
        data: { 
          publishedAt: newPublishedAt
        }
      });
    }
    
    fixedCount++;
  }
  
  return fixedCount;
}

/**
 * メイン処理
 */
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes('--execute');
  
  console.error('========================================');
  console.error(' タイムゾーン問題修正スクリプト');
  console.error('========================================\n');
  
  if (isDryRun) {
    console.error('[ドライランモード] 実際の変更は行われません\n');
  } else {
    console.error('[実行モード] データベースを更新します\n');
    
    // バックアップ作成
    const backupPath = await createBackup();
    console.error(`バックアップ完了: ${backupPath}\n`);
  }
  
  // 問題記事の検出
  console.error('問題のある記事を検出中...');
  const { problematicArticles, bySource } = await detectProblematicArticles();
  
  if (problematicArticles.length === 0) {
    console.error('\n問題のある記事は見つかりませんでした。');
    await prisma.$disconnect();
    return;
  }
  
  // 統計情報の表示
  console.error(`\n問題のある記事: ${problematicArticles.length}件\n`);
  console.error('ソース別内訳:');
  console.error('----------------------------------------');
  
  for (const [sourceName, articles] of Object.entries(bySource)) {
    console.error(`${sourceName}: ${articles.length}件`);
    
    // 各ソースの最初の3件を表示
    articles.slice(0, 3).forEach((article: any) => {
      console.error(`  - ${article.title.substring(0, 40)}... (時差: ${article.diffHours.toFixed(1)}時間)`);
    });
    
    if (articles.length > 3) {
      console.error(`  ... 他 ${articles.length - 3}件`);
    }
  }
  
  console.error('----------------------------------------\n');
  
  // 修正実行
  const fixedCount = await fixArticles(problematicArticles, isDryRun);
  
  // 結果表示
  console.error('\n========================================');
  if (isDryRun) {
    console.error(`[ドライラン完了] ${fixedCount}件の記事が修正対象です`);
    console.error('\n実際に修正を実行するには以下のコマンドを実行してください:');
    console.error('npx tsx scripts/manual/fix-timezone-issues.ts --execute');
  } else {
    console.error(`[修正完了] ${fixedCount}件の記事を修正しました`);
    
    // 修正後の確認
    const { problematicArticles: remaining } = await detectProblematicArticles();
    if (remaining.length === 0) {
      console.error('\n全ての問題が解決されました！');
    } else {
      console.error(`\n警告: まだ ${remaining.length}件の問題が残っています`);
    }
  }
  console.error('========================================');
  
  await prisma.$disconnect();
}

// エラーハンドリング
main().catch(async (error) => {
  console.error('エラーが発生しました:', error);
  await prisma.$disconnect();
  process.exit(1);
});
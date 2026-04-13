#!/usr/bin/env npx tsx
/**
 * 既存の企業ブログ記事を新しい個別ソースに移行するスクリプト
 */

import { createPrismaClient } from '@/lib/prisma/create-client';

const prisma = createPrismaClient();

// 既存のCorporate Tech BlogのソースID
const ORIGINAL_SOURCE_ID = 'cmdwgsk1b0000te2vrjnpm6gc';

// ドメインと新しいソースIDのマッピング
const domainToSourceMap: Record<string, string> = {
  'developers.freee.co.jp': 'freee_tech_blog',
  'developers.cyberagent.co.jp': 'cyberagent_tech_blog',
  'engineering.dena.com': 'dena_tech_blog',
  'tech.smarthr.jp': 'smarthr_tech_blog',
  'techblog.lycorp.co.jp': 'lycorp_tech_blog',
  'developers.gmo.jp': 'gmo_tech_blog',
  'buildersbox.corp-sansan.com': 'sansan_tech_blog',
  'engineering.mercari.com': 'mercari_tech_blog',
  'techblog.zozo.com': 'zozo_tech_blog',
  'moneyforward-dev.jp': 'moneyforward_tech_blog',
  'developer.hatenastaff.com': 'hatena_tech_blog',
  'tech.pepabo.com': 'pepabo_tech_blog',
  'techlife.cookpad.com': 'cookpad_tech_blog'
};

async function migrateArticles() {
  console.log('🚀 記事の移行を開始します...');
  
  // 移行対象の記事を取得
  const articles = await prisma.article.findMany({
    where: {
      sourceId: ORIGINAL_SOURCE_ID
    },
    select: {
      id: true,
      url: true,
      title: true
    }
  });
  
  console.log(`📚 ${articles.length}件の記事を処理します`);
  
  const migrationStats: Record<string, number> = {};
  let successCount = 0;
  let errorCount = 0;
  let unmappedCount = 0;
  
  for (const article of articles) {
    try {
      // URLからドメインを抽出
      const url = new URL(article.url);
      const domain = url.hostname;
      
      // 新しいソースIDを取得
      const newSourceId = domainToSourceMap[domain];
      
      if (!newSourceId) {
        console.warn(`⚠️  未知のドメイン: ${domain} (${article.title})`);
        unmappedCount++;
        continue;
      }
      
      // 記事のソースIDを更新
      await prisma.article.update({
        where: { id: article.id },
        data: { sourceId: newSourceId }
      });
      
      // 統計を更新
      migrationStats[newSourceId] = (migrationStats[newSourceId] || 0) + 1;
      successCount++;
      
      if (successCount % 10 === 0) {
        console.log(`  ${successCount}件処理完了...`);
      }
    } catch (error) {
      console.error(`❌ 記事の移行に失敗: ${article.title}`, error);
      errorCount++;
    }
  }
  
  console.log('\n📊 移行結果:');
  console.log(`  成功: ${successCount}件`);
  console.log(`  エラー: ${errorCount}件`);
  console.log(`  未マッピング: ${unmappedCount}件`);
  
  console.log('\n📈 ソース別移行数:');
  for (const [sourceId, count] of Object.entries(migrationStats)) {
    console.log(`  ${sourceId}: ${count}件`);
  }
  
  return { successCount, errorCount, unmappedCount };
}

async function verifyMigration() {
  console.log('\n🔍 移行結果を検証します...');
  
  // 元のソースに残っている記事を確認
  const remainingCount = await prisma.article.count({
    where: {
      sourceId: ORIGINAL_SOURCE_ID
    }
  });
  
  if (remainingCount > 0) {
    console.warn(`⚠️  元のソースに${remainingCount}件の記事が残っています`);
  } else {
    console.log('✅ 元のソースからすべての記事が移行されました');
  }
  
  // 新しいソースごとの記事数を確認
  const newSources = Object.values(domainToSourceMap);
  console.log('\n📊 新しいソースの記事数:');
  
  for (const sourceId of newSources) {
    const count = await prisma.article.count({
      where: { sourceId }
    });
    
    if (count > 0) {
      const source = await prisma.source.findUnique({
        where: { id: sourceId },
        select: { name: true }
      });
      console.log(`  ${source?.name || sourceId}: ${count}件`);
    }
  }
}

async function main() {
  try {
    // データベースのバックアップを推奨
    console.log('⚠️  注意: データベースのバックアップを取ることを推奨します');
    console.log('実行前に以下のコマンドでバックアップを作成してください:');
    console.log('docker exec techtrend-postgres pg_dump -U postgres techtrend_dev > backup_articles_$(date +%Y%m%d_%H%M%S).sql\n');
    
    // 確認プロンプト
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    await new Promise<void>((resolve) => {
      readline.question('移行を続行しますか？ (yes/no): ', (answer) => {
        readline.close();
        if (answer.toLowerCase() !== 'yes') {
          console.log('移行を中止しました');
          process.exit(0);
        }
        resolve();
      });
    });
    
    const result = await migrateArticles();
    
    if (result.errorCount > 0) {
      console.error('\n⚠️  一部の記事の移行に失敗しました');
    }
    
    await verifyMigration();
    
    console.log('\n✨ 記事の移行が完了しました');
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
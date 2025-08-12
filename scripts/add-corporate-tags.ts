#!/usr/bin/env tsx

/**
 * 既存の企業技術ブログ記事に企業名タグを付与するスクリプト
 * 
 * 使用方法:
 *   npx tsx scripts/add-corporate-tags.ts          # 実行
 *   npx tsx scripts/add-corporate-tags.ts --dry-run # ドライラン
 */

import { PrismaClient } from '@prisma/client';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const prisma = new PrismaClient();

// ドメインと企業名のマッピング
const domainToCompany: Record<string, string> = {
  'engineering.dena.com': 'DeNA',
  'techblog.lycorp.co.jp': 'LINEヤフー',
  'engineering.mercari.com': 'メルカリ',
  'developers.cyberagent.co.jp': 'CyberAgent',
  'tech.smarthr.jp': 'SmartHR',
  'developers.freee.co.jp': 'freee',
  'developers.gmo.jp': 'GMO',
  'techlife.cookpad.com': 'クックパッド',
  'techblog.yahoo.co.jp': 'LINEヤフー', // 旧URL
};

// 引数をパース
const argv = yargs(hideBin(process.argv))
  .option('dry-run', {
    type: 'boolean',
    default: false,
    description: 'Run without making actual changes',
  })
  .parseSync();

const isDryRun = argv['dry-run'];

async function main() {
  console.log('=== 企業技術ブログタグ付与スクリプト ===');
  console.log(`モード: ${isDryRun ? 'ドライラン' : '実行'}`);
  console.log('');

  try {
    // Corporate Tech Blogソースを取得
    const corporateSource = await prisma.source.findFirst({
      where: { name: 'Corporate Tech Blog' },
    });

    if (!corporateSource) {
      console.error('Corporate Tech Blogソースが見つかりません');
      process.exit(1);
    }

    // Corporate Tech Blogの全記事を取得
    const articles = await prisma.article.findMany({
      where: { sourceId: corporateSource.id },
      include: {
        tags: true,
      },
      orderBy: { publishedAt: 'desc' },
    });

    console.log(`対象記事数: ${articles.length}件`);
    console.log('');

    // 統計情報
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    const updates: { articleId: string; companyName: string }[] = [];

    // 各記事を処理
    for (const article of articles) {
      // URLからドメインを抽出
      let domain: string | null = null;
      try {
        const url = new URL(article.url);
        domain = url.hostname;
      } catch (error) {
        console.error(`URLパースエラー: ${article.url}`);
        failed++;
        continue;
      }

      // ドメインから企業名を判定
      const companyName = domainToCompany[domain];
      
      if (!companyName) {
        console.log(`[SKIP] 企業が判定できません: ${domain} - ${article.title.substring(0, 50)}...`);
        skipped++;
        continue;
      }

      // 既に企業タグが付与されているかチェック
      const hasCompanyTag = article.tags.some(tag => tag.name === companyName);
      
      if (hasCompanyTag) {
        console.log(`[SKIP] 既にタグ付与済み: ${companyName} - ${article.title.substring(0, 50)}...`);
        skipped++;
        continue;
      }

      // 更新対象として記録
      updates.push({ articleId: article.id, companyName });
      processed++;
      console.log(`[処理対象] ${companyName} - ${article.title.substring(0, 50)}...`);
    }

    console.log('');
    console.log('=== 処理サマリー ===');
    console.log(`処理対象: ${processed}件`);
    console.log(`スキップ: ${skipped}件`);
    console.log(`エラー: ${failed}件`);

    if (updates.length === 0) {
      console.log('');
      console.log('更新対象の記事がありません');
      return;
    }

    if (isDryRun) {
      console.log('');
      console.log('ドライランモードのため、実際の更新は行いません');
      console.log('更新対象の企業別内訳:');
      
      const companyCounts: Record<string, number> = {};
      for (const update of updates) {
        companyCounts[update.companyName] = (companyCounts[update.companyName] || 0) + 1;
      }
      
      for (const [company, count] of Object.entries(companyCounts)) {
        console.log(`  ${company}: ${count}件`);
      }
    } else {
      console.log('');
      console.log('タグを付与しています...');
      
      // トランザクションで一括更新
      await prisma.$transaction(async (tx) => {
        for (const update of updates) {
          // タグが存在しない場合は作成
          const tag = await tx.tag.upsert({
            where: { name: update.companyName },
            update: {},
            create: { 
              name: update.companyName,
              category: 'corporate'  // 企業カテゴリーとして設定
            },
          });

          // 記事にタグを関連付け
          await tx.article.update({
            where: { id: update.articleId },
            data: {
              tags: {
                connect: { id: tag.id },
              },
            },
          });
        }
      });
      
      console.log('');
      console.log('✅ タグ付与が完了しました');
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// エラーハンドリング
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// 実行
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
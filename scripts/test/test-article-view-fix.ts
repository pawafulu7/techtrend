#!/usr/bin/env npx tsx
/**
 * ArticleView既読データ保持機能のテスト
 * 100件を超える閲覧履歴の処理で既読状態が保持されることを確認
 */

import { prisma } from '../../lib/prisma';

// テスト用ユーザーID（実際のユーザーIDに置き換える必要がある場合があります）
const TEST_USER_ID = 'test-user-article-view-fix';

// 色付きコンソール出力
const log = {
  info: (msg: string) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  success: (msg: string) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  error: (msg: string) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  warning: (msg: string) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`),
};

async function cleanup() {
  log.info('テストデータのクリーンアップ中...');
  
  // テストユーザーのArticleViewを全て削除
  await prisma.articleView.deleteMany({
    where: { userId: TEST_USER_ID }
  });
  
  // テストユーザーを削除
  await prisma.user.deleteMany({
    where: { id: TEST_USER_ID }
  });
}

async function setup() {
  log.info('テスト環境のセットアップ中...');
  
  // クリーンアップ
  await cleanup();
  
  // テストユーザー作成
  await prisma.user.create({
    data: {
      id: TEST_USER_ID,
      email: 'test-article-view@example.com',
      name: 'Test User for ArticleView Fix',
    }
  });
  
  log.success('セットアップ完了');
}

async function createTestData() {
  log.info('テストデータ作成中...');
  
  // 記事を取得（150件）
  const articles = await prisma.article.findMany({
    take: 150,
    orderBy: { createdAt: 'desc' }
  });
  
  if (articles.length < 150) {
    log.warning(`記事数が不足しています: ${articles.length}件のみ`);
  }
  
  // ArticleViewレコードを作成（既読状態で）
  const now = new Date();
  
  for (let i = 0; i < articles.length; i++) {
    const viewedAt = new Date(now.getTime() - (i * 60000)); // 1分ずつ過去にする
    
    await prisma.articleView.create({
      data: {
        userId: TEST_USER_ID,
        articleId: articles[i].id,
        viewedAt: viewedAt,
        isRead: true,
        readAt: viewedAt,
      }
    });
  }
  
  log.success(`${articles.length}件のArticleViewレコードを作成`);
  return articles.length;
}

async function simulateArticleView() {
  log.info('記事閲覧をシミュレート（POST /api/article-views 相当の処理）...');
  
  // 最新の記事を1つ取得
  const article = await prisma.article.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  
  if (!article) {
    throw new Error('記事が見つかりません');
  }
  
  // 既存のArticleViewがあるか確認
  const existing = await prisma.articleView.findFirst({
    where: {
      userId: TEST_USER_ID,
      articleId: article.id,
    }
  });
  
  if (existing) {
    // 既存レコードの更新
    await prisma.articleView.update({
      where: { id: existing.id },
      data: { 
        viewedAt: new Date(),
        isRead: true,
        readAt: existing.readAt || new Date()
      },
    });
  } else {
    // 新規作成
    await prisma.articleView.create({
      data: {
        userId: TEST_USER_ID,
        articleId: article.id,
        viewedAt: new Date(),
        isRead: true,
        readAt: new Date()
      },
    });
  }
  
  // ここで実装した修正ロジックを実行
  const viewedCount = await prisma.articleView.count({
    where: { 
      userId: TEST_USER_ID,
      viewedAt: { not: null }
    },
  });
  
  log.info(`閲覧履歴のあるレコード数: ${viewedCount}`);
  
  if (viewedCount > 100) {
    log.info('100件を超えたので、古い履歴をクリア...');
    
    // 最新100件の閲覧履歴を保持
    const recentViews = await prisma.articleView.findMany({
      where: { 
        userId: TEST_USER_ID,
        viewedAt: { not: null }
      },
      orderBy: { viewedAt: 'desc' },
      take: 100,
      select: { id: true },
    });
    
    const recentViewIds = recentViews.map(v => v.id);
    
    // 削除ではなく、viewedAtをNULLに更新（既読状態は保持）
    const updateResult = await prisma.articleView.updateMany({
      where: {
        userId: TEST_USER_ID,
        viewedAt: { not: null },
        id: { notIn: recentViewIds },
      },
      data: {
        viewedAt: null
      }
    });
    
    log.success(`${updateResult.count}件の古い閲覧履歴をクリア（既読状態は保持）`);
  }
}

async function verifyResults() {
  log.info('テスト結果の検証中...');
  
  // 全ArticleViewレコード数
  const totalCount = await prisma.articleView.count({
    where: { userId: TEST_USER_ID }
  });
  
  // 閲覧履歴のあるレコード数
  const viewedCount = await prisma.articleView.count({
    where: { 
      userId: TEST_USER_ID,
      viewedAt: { not: null }
    }
  });
  
  // 既読状態のレコード数
  const readCount = await prisma.articleView.count({
    where: { 
      userId: TEST_USER_ID,
      isRead: true
    }
  });
  
  // viewedAt=NULLだが既読のレコード数
  const readButNotViewedCount = await prisma.articleView.count({
    where: { 
      userId: TEST_USER_ID,
      viewedAt: null,
      isRead: true
    }
  });
  
  log.info('===== テスト結果 =====');
  log.info(`総レコード数: ${totalCount}`);
  log.info(`閲覧履歴あり: ${viewedCount}`);
  log.info(`既読状態: ${readCount}`);
  log.info(`既読だが閲覧履歴なし: ${readButNotViewedCount}`);
  
  // アサーション
  const assertions: { condition: boolean; message: string }[] = [
    {
      condition: viewedCount <= 100,
      message: '閲覧履歴は100件以下に制限されている'
    },
    {
      condition: readCount === totalCount,
      message: 'すべてのレコードで既読状態が保持されている'
    },
    {
      condition: readButNotViewedCount > 0,
      message: '古い閲覧履歴がクリアされても既読状態は保持されている'
    },
    {
      condition: totalCount > 100,
      message: 'レコード自体は削除されていない'
    }
  ];
  
  let allPassed = true;
  
  for (const assertion of assertions) {
    if (assertion.condition) {
      log.success(`✓ ${assertion.message}`);
    } else {
      log.error(`✗ ${assertion.message}`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

async function main() {
  try {
    log.info('ArticleView既読データ保持機能のテストを開始');
    
    // セットアップ
    await setup();
    
    // テストデータ作成（150件）
    const count = await createTestData();
    
    if (count > 100) {
      // 記事閲覧シミュレーション（クリーンアップ処理実行）
      await simulateArticleView();
      
      // 結果検証
      const passed = await verifyResults();
      
      if (passed) {
        log.success('\n===== すべてのテストが成功しました =====');
        process.exit(0);
      } else {
        log.error('\n===== テストに失敗しました =====');
        process.exit(1);
      }
    } else {
      log.warning('テストデータが不足しているため、テストをスキップします');
      process.exit(0);
    }
    
  } catch (error) {
    log.error(`テスト実行中にエラーが発生: ${error}`);
    process.exit(1);
  } finally {
    // クリーンアップ
    await cleanup();
    await prisma.$disconnect();
  }
}

main();
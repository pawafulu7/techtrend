#!/usr/bin/env npx tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testDeleteArticles() {
  console.log('=== 記事削除処理テスト ===\n');
  
  try {
    // 1. テストデータの準備
    console.log('1. テストデータを作成中...');
    
    // Dev.toソースが存在することを確認
    const devtoSource = await prisma.source.upsert({
      where: { name: 'Dev.to' },
      update: {},
      create: {
        name: 'Dev.to',
        type: 'rss',
        url: 'https://dev.to/feed',
        enabled: true
      }
    });
    
    // テスト用ユーザーを作成（ArticleView作成のため）
    const testUser = await prisma.user.upsert({
      where: { email: 'test-delete@example.com' },
      update: {},
      create: {
        email: 'test-delete@example.com',
        name: 'Test User for Delete',
        password: 'dummy-password'
      }
    });
    
    // テスト記事を作成（bookmarks = 0）
    const testArticles = [];
    for (let i = 1; i <= 3; i++) {
      const article = await prisma.article.create({
        data: {
          title: `Test Dev.to Article ${i} - Will be deleted`,
          url: `https://dev.to/test/article-delete-${i}-${Date.now()}`,
          sourceId: devtoSource.id,
          bookmarks: 0, // 削除対象
          publishedAt: new Date(),
        }
      });
      testArticles.push(article);
    }
    
    // bookmarks > 0の記事も作成（削除されないはず）
    const keepArticle = await prisma.article.create({
      data: {
        title: 'Test Dev.to Article - Should be kept',
        url: `https://dev.to/test/article-keep-${Date.now()}`,
        sourceId: devtoSource.id,
        bookmarks: 10, // 削除対象外
        publishedAt: new Date(),
      }
    });
    
    // ArticleViewレコードを作成（削除対象記事に対して）
    for (const article of testArticles.slice(0, 2)) { // 最初の2つの記事にViewを作成
      await prisma.articleView.create({
        data: {
          userId: testUser.id,
          articleId: article.id,
          viewedAt: new Date(),
          isRead: true,
          readAt: new Date()
        }
      });
    }
    
    console.log(`  作成した削除対象記事: ${testArticles.length}件`);
    console.log(`  作成した保持対象記事: 1件`);
    console.log(`  作成したArticleView: 2件\n`);
    
    // 2. 削除前の状態を確認
    console.log('2. 削除前の状態...');
    const beforeCount = await prisma.article.count({
      where: {
        source: { name: 'Dev.to' },
        bookmarks: 0
      }
    });
    const beforeViewCount = await prisma.articleView.count({
      where: {
        articleId: { in: testArticles.map(a => a.id) }
      }
    });
    console.log(`  削除対象記事数: ${beforeCount}件`);
    console.log(`  関連ArticleView数: ${beforeViewCount}件\n`);
    
    // 3. 削除処理を実行
    console.log('3. 削除処理を実行中...');
    
    // 実際の削除処理（delete-low-quality-articles.tsの処理をここで実行）
    const devtoDeleted = await prisma.$transaction(async (tx) => {
      // 削除対象の記事IDを取得
      const targetArticles = await tx.article.findMany({
        where: {
          source: { name: 'Dev.to' },
          bookmarks: 0
        },
        select: { id: true }
      });
      
      const articleIds = targetArticles.map(a => a.id);
      
      if (articleIds.length === 0) {
        return { count: 0, viewsDeleted: 0 };
      }
      
      // ArticleViewを先に削除（外部キー制約を回避）
      const viewsDeleted = await tx.articleView.deleteMany({
        where: { articleId: { in: articleIds } }
      });
      
      // その後記事を削除
      const articlesDeleted = await tx.article.deleteMany({
        where: { id: { in: articleIds } }
      });
      
      return { 
        count: articlesDeleted.count, 
        viewsDeleted: viewsDeleted.count 
      };
    });
    
    console.log(`  削除された記事: ${devtoDeleted.count}件`);
    console.log(`  削除されたArticleView: ${devtoDeleted.viewsDeleted}件\n`);
    
    // 4. 削除後の検証
    console.log('4. 削除後の検証...');
    
    // 削除対象記事が削除されたか確認
    const afterCount = await prisma.article.count({
      where: {
        id: { in: testArticles.map(a => a.id) }
      }
    });
    
    // 保持対象記事が残っているか確認
    const keepArticleExists = await prisma.article.findUnique({
      where: { id: keepArticle.id }
    });
    
    // ArticleViewが削除されたか確認
    const afterViewCount = await prisma.articleView.count({
      where: {
        articleId: { in: testArticles.map(a => a.id) }
      }
    });
    
    console.log(`  残存する削除対象記事: ${afterCount}件（期待値: 0）`);
    console.log(`  保持対象記事の存在: ${keepArticleExists ? 'あり' : 'なし'}（期待値: あり）`);
    console.log(`  残存するArticleView: ${afterViewCount}件（期待値: 0）\n`);
    
    // 5. テスト結果の判定
    console.log('5. テスト結果:');
    let success = true;
    
    if (afterCount !== 0) {
      console.error('  ❌ 削除対象記事が残存しています');
      success = false;
    } else {
      console.log('  ✅ 削除対象記事は正常に削除されました');
    }
    
    if (!keepArticleExists) {
      console.error('  ❌ 保持対象記事が削除されました');
      success = false;
    } else {
      console.log('  ✅ 保持対象記事は正常に保持されました');
    }
    
    if (afterViewCount !== 0) {
      console.error('  ❌ ArticleViewが残存しています');
      success = false;
    } else {
      console.log('  ✅ ArticleViewは正常に削除されました');
    }
    
    // 6. クリーンアップ
    console.log('\n6. テストデータのクリーンアップ...');
    
    // 保持対象記事も削除
    if (keepArticleExists) {
      await prisma.article.delete({
        where: { id: keepArticle.id }
      });
    }
    
    // テストユーザーの削除
    await prisma.user.delete({
      where: { id: testUser.id }
    }).catch(() => {
      // 既に削除されている場合は無視
    });
    
    console.log('  クリーンアップ完了\n');
    
    if (success) {
      console.log('✅ すべてのテストが成功しました！');
      return 0;
    } else {
      console.error('❌ テストに失敗しました');
      return 1;
    }
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

// テスト実行
testDeleteArticles()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('予期しないエラー:', error);
    process.exit(1);
  });
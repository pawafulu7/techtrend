#!/usr/bin/env npx tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testCascadeDelete() {
  console.log('=== カスケード削除テスト ===\n');
  
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
    
    // テスト用ユーザーを作成
    const testUser = await prisma.user.upsert({
      where: { email: 'test-cascade@example.com' },
      update: {},
      create: {
        email: 'test-cascade@example.com',
        name: 'Test User for Cascade Delete'
      }
    });
    
    // テスト記事を作成
    const testArticle = await prisma.article.create({
      data: {
        title: `Test Article for Cascade Delete - ${Date.now()}`,
        url: `https://dev.to/test/cascade-delete-${Date.now()}`,
        sourceId: devtoSource.id,
        publishedAt: new Date(),
      }
    });
    
    // ArticleViewレコードを作成
    const articleView = await prisma.articleView.create({
      data: {
        userId: testUser.id,
        articleId: testArticle.id,
        viewedAt: new Date(),
        isRead: true,
        readAt: new Date()
      }
    });
    
    // お気に入りも作成（既にカスケード削除が設定されている）
    const favorite = await prisma.favorite.create({
      data: {
        userId: testUser.id,
        articleId: testArticle.id
      }
    });
    
    console.log('  テスト記事ID:', testArticle.id);
    console.log('  ArticleView ID:', articleView.id);
    console.log('  Favorite ID:', favorite.id, '\n');
    
    // 2. カスケード削除のテスト
    console.log('2. カスケード削除テスト（記事削除）...');
    
    // 記事を削除（トランザクションなし、シンプルな削除）
    await prisma.article.delete({
      where: { id: testArticle.id }
    });
    
    console.log('  記事削除完了\n');
    
    // 3. 削除結果の検証
    console.log('3. 削除結果の検証...');
    
    // ArticleViewが自動削除されたか確認
    const remainingView = await prisma.articleView.findUnique({
      where: {
        userId_articleId: {
          userId: testUser.id,
          articleId: testArticle.id
        }
      }
    });
    
    // Favoriteが自動削除されたか確認
    const remainingFavorite = await prisma.favorite.findUnique({
      where: {
        userId_articleId: {
          userId: testUser.id,
          articleId: testArticle.id
        }
      }
    });
    
    console.log('  残存ArticleView:', remainingView ? 'あり' : 'なし（期待値）');
    console.log('  残存Favorite:', remainingFavorite ? 'あり' : 'なし（期待値）\n');
    
    // 4. ユーザー削除のカスケードテスト
    console.log('4. カスケード削除テスト（ユーザー削除）...');
    
    // 新しいテストデータを作成
    const testArticle2 = await prisma.article.create({
      data: {
        title: `Test Article 2 for User Delete - ${Date.now()}`,
        url: `https://dev.to/test/user-cascade-${Date.now()}`,
        sourceId: devtoSource.id,
        publishedAt: new Date(),
      }
    });
    
    const testUser2 = await prisma.user.create({
      data: {
        email: `test-cascade2-${Date.now()}@example.com`,
        name: 'Test User 2'
      }
    });
    
    await prisma.articleView.create({
      data: {
        userId: testUser2.id,
        articleId: testArticle2.id,
        viewedAt: new Date()
      }
    });
    
    // ユーザーを削除
    await prisma.user.delete({
      where: { id: testUser2.id }
    });
    
    // ArticleViewが削除されたか確認
    const userViewCount = await prisma.articleView.count({
      where: { userId: testUser2.id }
    });
    
    console.log('  ユーザー削除後のArticleView数:', userViewCount, '（期待値: 0）\n');
    
    // 5. テスト結果の判定
    console.log('5. テスト結果:');
    let success = true;
    
    if (!remainingView) {
      console.log('  ✅ ArticleViewは記事削除時に自動削除されました（カスケード成功）');
    } else {
      console.error('  ❌ ArticleViewが残存しています（カスケード失敗）');
      success = false;
    }
    
    if (!remainingFavorite) {
      console.log('  ✅ Favoriteは記事削除時に自動削除されました（カスケード成功）');
    } else {
      console.error('  ❌ Favoriteが残存しています（カスケード失敗）');
      success = false;
    }
    
    if (userViewCount === 0) {
      console.log('  ✅ ArticleViewはユーザー削除時に自動削除されました（カスケード成功）');
    } else {
      console.error('  ❌ ユーザー削除後もArticleViewが残存しています');
      success = false;
    }
    
    // 6. クリーンアップ
    console.log('\n6. テストデータのクリーンアップ...');
    
    // 残存テストデータをクリーンアップ
    await prisma.article.delete({
      where: { id: testArticle2.id }
    }).catch(() => {});
    
    await prisma.user.delete({
      where: { id: testUser.id }
    }).catch(() => {});
    
    console.log('  クリーンアップ完了\n');
    
    if (success) {
      console.log('✅ カスケード削除が正常に動作しています！');
      console.log('   トランザクション処理なしで削除が可能になりました。');
      return 0;
    } else {
      console.error('❌ カスケード削除のテストに失敗しました');
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
testCascadeDelete()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('予期しないエラー:', error);
    process.exit(1);
  });
import { prisma } from '../../lib/database';

async function testMarkAllRead() {
  // 本番環境での実行を防ぐ
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ エラー: 本番環境でのテストスクリプト実行は禁止されています');
    process.exit(1);
  }
  
  // DATABASE_URLが本番を指していないかチェック
  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.includes('prod') || dbUrl.includes('production')) {
    console.error('❌ エラー: 本番データベースへの接続が検出されました');
    process.exit(1);
  }
  
  // userIdをコマンドライン引数または環境変数から取得
  const userId = process.argv[2] || process.env.TEST_USER_ID || 'cmegdo3dv0000te6hh4cdhykx';
  
  console.log('=== 全て既読機能のデバッグテスト ===');
  console.log(`環境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`対象ユーザーID: ${userId}`);
  
  // 警告表示
  console.log('\n⚠️  警告: このスクリプトは大量のデータを変更します');
  console.log('実行を続けるには5秒待ちます...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // 現在の状態を確認
  const beforeCount = await prisma.articleView.count({
    where: { userId }
  });
  console.log(`テスト前のArticleView数: ${beforeCount}`);
  
  // 未読数を確認
  const unreadCount = await prisma.article.count({
    where: {
      OR: [
        {
          articleViews: {
            none: {
              userId
            }
          }
        },
        {
          articleViews: {
            some: {
              userId,
              isRead: false
            }
          }
        }
      ]
    }
  });
  console.log(`未読数: ${unreadCount}`);
  
  try {
    // SQL直接実行（APIと同じ）
    console.log('\nSQL実行中...');
    const startTime = Date.now();
    
    const result = await prisma.$executeRaw`
      INSERT INTO "ArticleView" ("id", "userId", "articleId", "isRead", "readAt", "viewedAt")
      SELECT 
        gen_random_uuid(),
        ${userId},
        a.id,
        true,
        NOW(),
        NULL
      FROM "Article" a
      WHERE NOT EXISTS (
        SELECT 1 FROM "ArticleView" av 
        WHERE av."userId" = ${userId}
        AND av."articleId" = a.id
        AND av."isRead" = true
      )
      ON CONFLICT ("userId", "articleId") 
      DO UPDATE SET 
        "isRead" = true,
        "readAt" = NOW()
    `;
    
    const endTime = Date.now();
    console.log(`実行時間: ${endTime - startTime}ms`);
    console.log(`処理件数: ${result}`);
    
    // 実行後の状態を確認
    const afterCount = await prisma.articleView.count({
      where: { userId }
    });
    console.log(`\nテスト後のArticleView数: ${afterCount}`);
    console.log(`増加数: ${afterCount - beforeCount}`);
    
  } catch (error) {
    console.error('エラー発生:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testMarkAllRead().catch(console.error);
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixEmptyTags() {
  console.log('空のタグを修正中...\n');
  
  try {
    // 1. 空のタグを取得
    const emptyTag = await prisma.tag.findFirst({
      where: {
        name: ''
      }
    });
    
    if (!emptyTag) {
      console.log('✅ 空のタグは見つかりませんでした。');
      return;
    }
    
    console.log(`空のタグ情報:`);
    console.log(`  ID: ${emptyTag.id}`);
    console.log(`  名前: "${emptyTag.name}"\n`);
    
    // 2. 空のタグが関連付けられている記事数を確認
    const articlesWithEmptyTag = await prisma.article.count({
      where: {
        tags: {
          some: {
            id: emptyTag.id
          }
        }
      }
    });
    
    console.log(`空のタグが設定されている記事数: ${articlesWithEmptyTag}件\n`);
    
    // 確認プロンプト
    console.log('【実行内容】');
    console.log('1. すべての記事から空のタグを切り離す');
    console.log('2. 空のタグをデータベースから削除する\n');
    
    // 3. 空のタグを記事から切り離す
    console.log('記事から空のタグを切り離し中...');
    const disconnectResult = await prisma.article.updateMany({
      where: {
        tags: {
          some: {
            id: emptyTag.id
          }
        }
      },
      data: {}
    });
    
    // Prismaの多対多リレーションの切り離しは別のアプローチが必要
    // 各記事を個別に更新
    const articles = await prisma.article.findMany({
      where: {
        tags: {
          some: {
            id: emptyTag.id
          }
        }
      },
      select: { id: true }
    });
    
    for (const article of articles) {
      await prisma.article.update({
        where: { id: article.id },
        data: {
          tags: {
            disconnect: { id: emptyTag.id }
          }
        }
      });
    }
    
    console.log(`✅ ${articles.length}件の記事から空のタグを切り離しました`);
    
    // 4. 空のタグを削除
    console.log('\n空のタグを削除中...');
    await prisma.tag.delete({
      where: { id: emptyTag.id }
    });
    
    console.log('✅ 空のタグを削除しました');
    
    // 5. 確認
    const remainingEmptyTags = await prisma.tag.count({
      where: { name: '' }
    });
    
    if (remainingEmptyTags === 0) {
      console.log('\n✅ すべての空のタグが正常に削除されました');
    } else {
      console.log(`\n⚠️  まだ ${remainingEmptyTags} 個の空のタグが残っています`);
    }
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// コマンドライン引数の処理
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(`
使用方法: npx tsx scripts/fix-empty-tags.ts

空のタグを記事から切り離し、データベースから削除します。

オプション:
  --help  このヘルプを表示
    `);
    process.exit(0);
  }
  
  fixEmptyTags()
    .then(() => {
      console.log('\n処理が完了しました');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { fixEmptyTags };
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addCorporateTechBlogSource() {
  try {
    // 既存のソースをチェック
    const existingSource = await prisma.source.findUnique({
      where: { name: 'Corporate Tech Blog' }
    });

    if (existingSource) {
      console.log('Corporate Tech Blog source already exists:', existingSource);
      return;
    }

    // 新しいソースを作成
    const newSource = await prisma.source.create({
      data: {
        name: 'Corporate Tech Blog',
        type: 'RSS',
        url: 'https://engineering.dena.com/blog/', // 代表URL（DeNA）
        enabled: true
      }
    });

    console.log('Successfully created Corporate Tech Blog source:', newSource);
    console.log('\n含まれる企業ブログ:');
    console.log('- DeNA: https://engineering.dena.com/blog/');
    console.log('- Yahoo! JAPAN: https://techblog.yahoo.co.jp/');
    console.log('- メルカリ: https://engineering.mercari.com/');
    console.log('- サイバーエージェント: https://developers.cyberagent.co.jp/');
    console.log('- LINEヤフー: https://techblog.lycorp.co.jp/');

  } catch (error) {
    console.error('Error adding Corporate Tech Blog source:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// スクリプトを実行
addCorporateTechBlogSource()
  .then(() => {
    console.log('\nデータベースへの登録が完了しました');
    console.log('次のコマンドで記事を取得できます:');
    console.log('npx tsx scripts/collect-feeds.ts "Corporate Tech Blog"');
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
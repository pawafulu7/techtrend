import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addCorporateTechBlogSource() {
  try {
    // 既存のソースをチェック
    const existingSource = await prisma.source.findUnique({
      where: { name: 'Corporate Tech Blog' }
    });

    if (existingSource) {
      console.error('Corporate Tech Blog source already exists:', existingSource);
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

    console.error('Successfully created Corporate Tech Blog source:', newSource);
    console.error('\n含まれる企業ブログ:');
    console.error('- DeNA: https://engineering.dena.com/blog/');
    console.error('- Yahoo! JAPAN: https://techblog.yahoo.co.jp/');
    console.error('- メルカリ: https://engineering.mercari.com/');
    console.error('- サイバーエージェント: https://developers.cyberagent.co.jp/');
    console.error('- LINEヤフー: https://techblog.lycorp.co.jp/');

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
    console.error('\nデータベースへの登録が完了しました');
    console.error('次のコマンドで記事を取得できます:');
    console.error('npx tsx scripts/collect-feeds.ts "Corporate Tech Blog"');
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
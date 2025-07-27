const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// フェッチャーをインポート
const hatenaFetcher = require('../lib/fetchers/hatena');
const qiitaFetcher = require('../lib/fetchers/qiita');
const zennFetcher = require('../lib/fetchers/zenn');
const devtoFetcher = require('../lib/fetchers/devto');
const publickeyFetcher = require('../lib/fetchers/publickey');
const stackoverflowFetcher = require('../lib/fetchers/stackoverflow');
const infoqFetcher = require('../lib/fetchers/infoq');
const thinkitFetcher = require('../lib/fetchers/thinkit');

const fetchers = {
  'はてなブックマーク': hatenaFetcher,
  'Qiita': qiitaFetcher,
  'Zenn': zennFetcher,
  'Dev.to': devtoFetcher,
  'Publickey': publickeyFetcher,
  'Stack Overflow Blog': stackoverflowFetcher,
  'InfoQ Japan': infoqFetcher,
  'Think IT': thinkitFetcher,
};

async function collectFeeds() {
  console.log('📡 フィード収集を開始します...');
  const startTime = Date.now();
  
  try {
    // 有効なソースを取得
    const sources = await prisma.source.findMany({
      where: { enabled: true }
    });

    let totalNewArticles = 0;
    let totalDuplicates = 0;

    for (const source of sources) {
      const fetcher = fetchers[source.name];
      if (!fetcher) {
        console.log(`⚠️  ${source.name}: フェッチャーが見つかりません`);
        continue;
      }

      try {
        console.log(`\n📥 ${source.name} から記事を取得中...`);
        
        // エラーが予想されるソースは事前チェック
        if (!source.enabled) {
          console.log(`   ⚠️  無効化されています`);
          continue;
        }
        
        const articles = await fetcher.fetch(source);
        
        if (!articles || articles.length === 0) {
          console.log(`   記事が見つかりませんでした`);
          continue;
        }

        console.log(`   ${articles.length}件の記事を取得しました`);

        // 各記事を保存（重複チェック付き）
        let newCount = 0;
        let duplicateCount = 0;

        for (const article of articles) {
          try {
            // URLまたはexternalIdで重複チェック
            const existing = await prisma.article.findFirst({
              where: {
                OR: [
                  { url: article.url },
                  { externalId: article.externalId }
                ]
              }
            });

            if (existing) {
              duplicateCount++;
              continue;
            }

            // 新規記事を保存
            await prisma.article.create({
              data: {
                title: article.title,
                url: article.url,
                externalId: article.externalId,
                summary: article.summary || null,
                content: article.content || null,
                publishedAt: article.publishedAt,
                bookmarks: article.bookmarks || 0,
                sourceId: source.id,
                // tags は一旦省略（別途処理が必要）
              }
            });

            newCount++;
          } catch (error) {
            console.error(`   記事保存エラー: ${article.title}`, error.message);
          }
        }

        console.log(`   ✅ 新規: ${newCount}件, 重複: ${duplicateCount}件`);
        totalNewArticles += newCount;
        totalDuplicates += duplicateCount;

      } catch (error) {
        console.error(`❌ ${source.name} のフェッチエラー:`, error.message);
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n📊 収集完了: 新規${totalNewArticles}件, 重複${totalDuplicates}件 (${duration}秒)`);

    return { newArticles: totalNewArticles, duplicates: totalDuplicates };

  } catch (error) {
    console.error('❌ フィード収集エラー:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された場合
if (require.main === module) {
  collectFeeds()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { collectFeeds };
import { PrismaClient, Source } from '@prisma/client';
import { CreateArticleInput } from '@/lib/types/article';

const prisma = new PrismaClient();

// フェッチャーをインポート
import { HatenaExtendedFetcher } from '../lib/fetchers/hatena-extended';
import { QiitaFetcher } from '../lib/fetchers/qiita';
import { ZennFetcher } from '../lib/fetchers/zenn';
import { DevToFetcher } from '../lib/fetchers/devto';
import { PublickeyFetcher } from '../lib/fetchers/publickey';
import { StackOverflowBlogFetcher } from '../lib/fetchers/stackoverflow-blog';
import { InfoQJapanFetcher } from '../lib/fetchers/infoq-japan';
import { ThinkITFetcher } from '../lib/fetchers/thinkit';
import { BaseFetcher } from '../lib/fetchers/base';

const fetchers: Record<string, new (source: Source) => BaseFetcher> = {
  'はてなブックマーク': HatenaExtendedFetcher,
  'Qiita': QiitaFetcher,
  'Zenn': ZennFetcher,
  'Dev.to': DevToFetcher,
  'Publickey': PublickeyFetcher,
  'Stack Overflow Blog': StackOverflowBlogFetcher,
  'InfoQ Japan': InfoQJapanFetcher,
  'Think IT': ThinkITFetcher,
};

interface CollectResult {
  newArticles: number;
  duplicates: number;
}

async function collectFeeds(): Promise<CollectResult> {
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
      const FetcherClass = fetchers[source.name];
      if (!FetcherClass) {
        console.log(`⚠️  ${source.name}: フェッチャーが見つかりません`);
        continue;
      }

      try {
        const fetcher = new FetcherClass(source);
        const { articles, errors } = await fetcher.fetch();
        
        if (errors.length > 0) {
          errors.forEach(err => console.error(`   エラー: ${err.message}`));
        }
        
        if (!articles || articles.length === 0) {
          continue;
        }

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
                  ...(article.externalId ? [{ externalId: article.externalId }] : [])
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
            console.error(`   記事保存エラー: ${article.title}`, error instanceof Error ? error.message : String(error));
          }
        }

        if (newCount > 0 || duplicateCount > 0) {
          console.log(`   ✅ 新規: ${newCount}件, 重複: ${duplicateCount}件`);
        }
        
        totalNewArticles += newCount;
        totalDuplicates += duplicateCount;

      } catch (error) {
        console.error(`❌ ${source.name} のフェッチエラー:`, error instanceof Error ? error.message : String(error));
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

export { collectFeeds };
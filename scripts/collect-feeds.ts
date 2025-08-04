import { PrismaClient, Source } from '@prisma/client';
import { CreateArticleInput } from '@/types/models';
import { isDuplicate } from '@/lib/utils/duplicate-detection';

const prisma = new PrismaClient();

// フェッチャーをインポート
import { HatenaExtendedFetcher } from '../lib/fetchers/hatena-extended';
import { QiitaPopularFetcher } from '../lib/fetchers/qiita-popular';
import { ZennExtendedFetcher } from '../lib/fetchers/zenn-extended';
import { DevToFetcher } from '../lib/fetchers/devto';
import { PublickeyFetcher } from '../lib/fetchers/publickey';
import { StackOverflowBlogFetcher } from '../lib/fetchers/stackoverflow-blog';
import { ThinkITFetcher } from '../lib/fetchers/thinkit';
import { SpeakerDeckFetcher } from '../lib/fetchers/speakerdeck';
import { RailsReleasesFetcher } from '../lib/fetchers/rails-releases';
import { AWSFetcher } from '../lib/fetchers/aws';
import { SREFetcher } from '../lib/fetchers/sre';
import { GoogleDevBlogFetcher } from '../lib/fetchers/google-dev-blog';
import { CorporateTechBlogFetcher } from '../lib/fetchers/corporate-tech-blog';
// import { GitHubBlogFetcher } from '../lib/fetchers/github-blog';
// import { MicrosoftDevBlogFetcher } from '../lib/fetchers/microsoft-dev-blog';
import { BaseFetcher } from '../lib/fetchers/base';

const fetchers: Record<string, new (source: Source) => BaseFetcher> = {
  'はてなブックマーク': HatenaExtendedFetcher,
  'Qiita Popular': QiitaPopularFetcher,
  'Zenn': ZennExtendedFetcher,
  'Dev.to': DevToFetcher,
  'Publickey': PublickeyFetcher,
  'Stack Overflow Blog': StackOverflowBlogFetcher,
  'Think IT': ThinkITFetcher,
  'Speaker Deck': SpeakerDeckFetcher,
  'Rails Releases': RailsReleasesFetcher,
  'AWS': AWSFetcher,
  'SRE': SREFetcher,
  'Google Developers Blog': GoogleDevBlogFetcher,
  'Corporate Tech Blog': CorporateTechBlogFetcher,
  // 'GitHub Blog': GitHubBlogFetcher,
  // 'Microsoft Developer Blog': MicrosoftDevBlogFetcher,
};

interface CollectResult {
  newArticles: number;
  duplicates: number;
}

async function collectFeeds(sourceTypes?: string[]): Promise<CollectResult> {
  console.log('📡 フィード収集を開始します...');
  if (sourceTypes && sourceTypes.length > 0) {
    console.log(`   対象ソース: ${sourceTypes.join(', ')}`);
  }
  const startTime = Date.now();
  
  try {
    // 有効なソースを取得（sourceTypesが指定されている場合はフィルタリング）
    const sources = await prisma.source.findMany({
      where: {
        enabled: true,
        ...(sourceTypes && sourceTypes.length > 0 && {
          name: { in: sourceTypes }
        })
      }
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
            // URLで重複チェック
            const existing = await prisma.article.findFirst({
              where: { url: article.url }
            });

            if (existing) {
              duplicateCount++;
              continue;
            }

            // タイトルの類似性チェック（過去7日間の記事と比較）
            const recentArticles = await prisma.article.findMany({
              where: {
                publishedAt: {
                  gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                }
              },
              select: { title: true }
            });

            const hasSimilarTitle = recentArticles.some(existingArticle => 
              isDuplicate(existingArticle.title, article.title, 0.85)
            );

            if (hasSimilarTitle) {
              console.log(`   重複記事を検出: ${article.title.substring(0, 50)}...`);
              duplicateCount++;
              continue;
            }

            // タグの処理
            const tagConnections = [];
            if (article.tagNames && article.tagNames.length > 0) {
              for (const tagName of article.tagNames) {
                const tag = await prisma.tag.upsert({
                  where: { name: tagName },
                  update: {},
                  create: { name: tagName }
                });
                tagConnections.push({ id: tag.id });
              }
            }

            // 新規記事を保存
            await prisma.article.create({
              data: {
                title: article.title,
                url: article.url,
                summary: article.summary || null,
                content: article.content || null,
                publishedAt: article.publishedAt,
                bookmarks: article.bookmarks || 0,
                sourceId: source.id,
                ...(tagConnections.length > 0 && {
                  tags: {
                    connect: tagConnections
                  }
                })
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
  // コマンドライン引数からソースタイプを取得
  const args = process.argv.slice(2);
  const sourceTypes = args.length > 0 ? args : undefined;
  
  collectFeeds(sourceTypes)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { collectFeeds };
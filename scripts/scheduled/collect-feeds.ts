import { PrismaClient, Source } from '@prisma/client';
import { CreateArticleInput } from '@/types/models';
import { isDuplicate } from '@/lib/utils/duplicate-detection';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { adjustTimezoneForArticle } from '@/lib/utils/date';

const prisma = new PrismaClient();

// フェッチャーをインポート
import { HatenaExtendedFetcher } from '@/lib/fetchers/hatena-extended';
import { QiitaPopularFetcher } from '@/lib/fetchers/qiita-popular';
import { ZennExtendedFetcher } from '@/lib/fetchers/zenn-extended';
import { DevToFetcher } from '@/lib/fetchers/devto';
import { PublickeyFetcher } from '@/lib/fetchers/publickey';
import { StackOverflowBlogFetcher } from '@/lib/fetchers/stackoverflow-blog';
import { ThinkITFetcher } from '@/lib/fetchers/thinkit';
import { SpeakerDeckFetcher } from '@/lib/fetchers/speakerdeck';
import { RailsReleasesFetcher } from '@/lib/fetchers/rails-releases';
import { AWSFetcher } from '@/lib/fetchers/aws';
import { SREFetcher } from '@/lib/fetchers/sre';
import { GoogleDevBlogFetcher } from '@/lib/fetchers/google-dev-blog';
import { CorporateTechBlogFetcher } from '@/lib/fetchers/corporate-tech-blog';
import { HuggingFaceFetcher } from '@/lib/fetchers/huggingface';
import { GoogleAIFetcher } from '@/lib/fetchers/google-ai';
import { InfoQJapanFetcher } from '@/lib/fetchers/infoq-japan';
import { DocswellFetcher } from '@/lib/fetchers/docswell';
import { GitHubBlogFetcher } from '@/lib/fetchers/github-blog';
import { CloudflareBlogFetcher } from '@/lib/fetchers/cloudflare-blog';
import { MozillaHacksFetcher } from '@/lib/fetchers/mozilla-hacks';
import { HackerNewsFetcher } from '@/lib/fetchers/hacker-news';
import { MediumEngineeringFetcher } from '@/lib/fetchers/medium-engineering';
// import { MicrosoftDevBlogFetcher } from '@/lib/fetchers/microsoft-dev-blog';
import { BaseFetcher } from '@/lib/fetchers/base';

// エンリッチャーをインポート
import { GoogleAIEnricher } from '../../lib/enrichers/google-ai';
import { BaseContentEnricher } from '../../lib/enrichers/base';

// エンリッチャーのマッピング
const enrichers: Record<string, BaseContentEnricher> = {
  'Google AI Blog': new GoogleAIEnricher(),
};

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
  'Hugging Face Blog': HuggingFaceFetcher,
  'Google AI Blog': GoogleAIFetcher,
  'InfoQ Japan': InfoQJapanFetcher,
  'Docswell': DocswellFetcher,
  'GitHub Blog': GitHubBlogFetcher,
  'Cloudflare Blog': CloudflareBlogFetcher,
  'Mozilla Hacks': MozillaHacksFetcher,
  'Hacker News': HackerNewsFetcher,
  'Medium Engineering': MediumEngineeringFetcher,
  // 'Microsoft Developer Blog': MicrosoftDevBlogFetcher,
};

interface CollectResult {
  newArticles: number;
  duplicates: number;
}

async function collectFeeds(sourceTypes?: string[]): Promise<CollectResult> {
  console.error('📡 フィード収集を開始します...');
  if (sourceTypes && sourceTypes.length > 0) {
    console.error(`   対象ソース: ${sourceTypes.join(', ')}`);
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
        console.error(`⚠️  ${source.name}: フェッチャーが見つかりません`);
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
              console.error(`   重複記事を検出: ${article.title.substring(0, 50)}...`);
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

            // 新規記事を保存（タイムゾーン調整を適用）
            const savedArticle = await prisma.article.create({
              data: {
                title: article.title,
                url: article.url,
                summary: null,  // 必ずnullを設定（要約はgenerate-summaries.tsで生成）
                thumbnail: article.thumbnail || null,  // サムネイル保存を追加
                content: article.content || null,
                publishedAt: adjustTimezoneForArticle(article.publishedAt, source.name),
                bookmarks: article.bookmarks || 0,
                sourceId: source.id,
                ...(tagConnections.length > 0 && {
                  tags: {
                    connect: tagConnections
                  }
                })
              }
            });

            // エンリッチメント処理（対応するエンリッチャーがある場合）
            const enricher = enrichers[source.name];
            if (enricher && enricher.canHandle(article.url)) {
              try {
                console.error(`   🔍 エンリッチメント実行: ${article.title.substring(0, 40)}...`);
                const enrichedData = await enricher.enrich(article.url);
                
                if (enrichedData && enrichedData.content) {
                  // エンリッチメントしたコンテンツで更新
                  await prisma.article.update({
                    where: { id: savedArticle.id },
                    data: {
                      content: enrichedData.content,
                      ...(enrichedData.thumbnail && { thumbnail: enrichedData.thumbnail })
                    }
                  });
                  console.error(`   ✅ エンリッチメント成功: ${enrichedData.content.length}文字`);
                } else {
                  console.error(`   ⚠️ エンリッチメント失敗: コンテンツなし`);
                }
              } catch (enrichError) {
                console.error(`   ⚠️ エンリッチメントエラー:`, enrichError instanceof Error ? enrichError.message : String(enrichError));
                // エンリッチメントが失敗しても記事保存は成功とする
              }
              
              // Rate limit対策：エンリッチメント後は2秒待機
              await new Promise(resolve => setTimeout(resolve, 2000));
            }

            newCount++;
          } catch (error) {
            console.error(`   記事保存エラー: ${article.title}`, error instanceof Error ? error.message : String(error));
          }
        }

        if (newCount > 0 || duplicateCount > 0) {
          console.error(`   ✅ 新規: ${newCount}件, 重複: ${duplicateCount}件`);
        }
        
        totalNewArticles += newCount;
        totalDuplicates += duplicateCount;

      } catch (error) {
        console.error(`❌ ${source.name} のフェッチエラー:`, error instanceof Error ? error.message : String(error));
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`\n📊 収集完了: 新規${totalNewArticles}件, 重複${totalDuplicates}件 (${duration}秒)`);

    // 新規記事が追加された場合はキャッシュを無効化
    if (totalNewArticles > 0) {
      console.error('🔄 キャッシュを無効化中...');
      await cacheInvalidator.onBulkImport();
      
      // 新規記事があれば要約生成を自動実行
      console.error('\n📝 要約生成を自動実行します...');
      try {
        const { generateSummaries } = await import('../maintenance/generate-summaries');
        const result = await generateSummaries();
        console.error(`✅ 要約生成完了: ${result.generated}件の要約を生成`);
      } catch (error) {
        console.error('⚠️ 要約生成でエラーが発生しましたが、記事収集は成功しています:', 
          error instanceof Error ? error.message : String(error));
      }
    }

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
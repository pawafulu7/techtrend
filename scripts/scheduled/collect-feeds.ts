import { PrismaClient, Source } from '@prisma/client';
import pLimit from 'p-limit';
import { Mutex } from 'async-mutex';
import { isDuplicate } from '@/lib/utils/duplicate-detection';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { adjustTimezoneForArticle } from '@/lib/utils/date';
import { CategoryClassifier } from '@/lib/services/category-classifier';
import { normalizeTag } from '@/lib/utils/tag-normalizer';

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

// AI/LLM関連フェッチャー
import { OpenAIBlogFetcher } from '@/lib/fetchers/ai/openai-blog';
import { HuggingFacePapersFetcher } from '@/lib/fetchers/ai/huggingface-papers';
import { ArxivAIFetcher } from '@/lib/fetchers/ai/arxiv-ai';
import { ZennAIFetcher } from '@/lib/fetchers/ai/zenn-ai';
import { QiitaAIFetcher } from '@/lib/fetchers/ai/qiita-ai';
import { NVIDIADeveloperBlogFetcher } from '@/lib/fetchers/nvidia-developer-blog';
import { DeepMindBlogFetcher } from '@/lib/fetchers/deepmind-blog';

// 企業ブログフェッチャーを個別にインポート
import { DenaFetcher } from '@/lib/fetchers/corporate-blogs/dena-fetcher';
import { SmartHRFetcher } from '@/lib/fetchers/corporate-blogs/smarthr-fetcher';
import { LYCorpFetcher } from '@/lib/fetchers/corporate-blogs/lycorp-fetcher';
import { MercariFetcher } from '@/lib/fetchers/corporate-blogs/mercari-fetcher';
import { SansanFetcher } from '@/lib/fetchers/corporate-blogs/sansan-fetcher';
import { ZOZOFetcher } from '@/lib/fetchers/corporate-blogs/zozo-fetcher';
import { HatenaFetcher } from '@/lib/fetchers/corporate-blogs/hatena-fetcher';
import { MoneyForwardFetcher } from '@/lib/fetchers/corporate-blogs/moneyforward-fetcher';
import { PepaboFetcher } from '@/lib/fetchers/corporate-blogs/pepabo-fetcher';
import { FreeeFetcher } from '@/lib/fetchers/corporate-blogs/freee-fetcher';
import { CookpadFetcher } from '@/lib/fetchers/corporate-blogs/cookpad-fetcher';
import { CyberAgentFetcher } from '@/lib/fetchers/corporate-blogs/cyberagent-fetcher';
import { GMOFetcher } from '@/lib/fetchers/corporate-blogs/gmo-fetcher';

import { BaseFetcher } from '@/lib/fetchers/base';

// エンリッチャーをインポート
import { ContentEnricherFactory } from '@/lib/enrichers';

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

  // AI/LLM関連
  'OpenAI Blog': OpenAIBlogFetcher,
  'Hugging Face Papers': HuggingFacePapersFetcher,
  'arXiv AI': ArxivAIFetcher,
  'Zenn AI': ZennAIFetcher,
  'Qiita AI': QiitaAIFetcher,
  'NVIDIA Developer Blog': NVIDIADeveloperBlogFetcher,
  'DeepMind Blog': DeepMindBlogFetcher,

  // 個別企業ブログフェッチャー
  // IMPORTANT: キー名はDBのSource.nameと完全一致させること（大文字小文字含む）
  'DeNA Engineering': DenaFetcher,
  'SmartHR Tech Blog': SmartHRFetcher,
  'LY Corporation Tech Blog': LYCorpFetcher,
  'Mercari Engineering': MercariFetcher,
  'Sansan Builders Box': SansanFetcher,
  'ZOZO TECH BLOG': ZOZOFetcher,
  'Hatena Developer Blog': HatenaFetcher,
  'Money Forward Developers Blog': MoneyForwardFetcher,
  'ペパボテックブログ': PepaboFetcher,
  'freee Developers Hub': FreeeFetcher,
  'Cookpad Tech Life': CookpadFetcher,
  'CyberAgent Developers Blog': CyberAgentFetcher,
  'GMO Developers': GMOFetcher,
};

interface CollectResult {
  newArticles: number;
  duplicates: number;
}

const DEFAULT_COLLECT_CONCURRENCY = 5;

interface ProcessSourceContext {
  source: Source;
  recentTitlesSet: Set<string>;
  recentTitlesMutex: Mutex;
  enricherFactory: ContentEnricherFactory;
}

interface ProcessSourceResult {
  newArticles: number;
  duplicates: number;
}

function resolveCollectConcurrency(): number {
  const rawValue = process.env.COLLECT_FEEDS_CONCURRENCY;
  if (!rawValue) {
    return DEFAULT_COLLECT_CONCURRENCY;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed)) {
    console.error(`⚠️  COLLECT_FEEDS_CONCURRENCYの値が不正です (${rawValue})。デフォルト${DEFAULT_COLLECT_CONCURRENCY}を使用します。`);
    return DEFAULT_COLLECT_CONCURRENCY;
  }

  return Math.max(1, parsed);
}

async function processSource({
  source,
  recentTitlesSet,
  recentTitlesMutex,
  enricherFactory
}: ProcessSourceContext): Promise<ProcessSourceResult> {
  const result: ProcessSourceResult = { newArticles: 0, duplicates: 0 };
  const sourceStart = Date.now();
  let newCount = 0;
  let duplicateCount = 0;
  let fetchedArticlesCount = 0;
  let failed = false;

  const FetcherClass = fetchers[source.name];
  if (!FetcherClass) {
    console.error(`⚠️  ${source.name}: フェッチャーが見つかりません`);
    const duration = Math.round((Date.now() - sourceStart) / 1000);
    console.error(`   [${source.name}] Duration: ${duration}s, Articles: 0, New: 0 (skipped)`);
    return result;
  }

  try {
    const fetcher = new FetcherClass(source);
    const { articles, errors } = await fetcher.fetch();

    if (errors.length > 0) {
      errors.forEach(err => console.error(`   エラー: ${err.message}`));
    }

    fetchedArticlesCount = articles?.length ?? 0;

    if (!articles || articles.length === 0) {
      return result;
    }

    for (const article of articles) {
      try {
        const existing = await prisma.article.findFirst({
          where: { url: article.url }
        });

        if (existing) {
          duplicateCount++;
          continue;
        }

        // Mutex-protected duplicate check and reservation
        const shouldSkip = await recentTitlesMutex.runExclusive(() => {
          const dup = [...recentTitlesSet].some(existing =>
            isDuplicate(existing, article.title, 0.85)
          );
          if (dup) return true;
          recentTitlesSet.add(article.title); // Reserve immediately
          return false;
        });

        if (shouldSkip) {
          console.error(`   重複記事を検出: ${article.title.substring(0, 50)}...`);
          duplicateCount++;
          continue;
        }

        const tagConnections: Array<{ id: string }> = [];
        const tags: Array<{ name: string }> = [];
        if (article.tagNames && article.tagNames.length > 0) {
          for (const tagName of article.tagNames) {
            const normalizedName = normalizeTag(tagName);
            const tag = await prisma.tag.upsert({
              where: { name: normalizedName },
              update: {},
              create: { name: normalizedName }
            });
            tagConnections.push({ id: tag.id });
            tags.push({ name: normalizedName });
          }
        }

        const category = CategoryClassifier.classify(tags, article.title, article.content);

        const savedArticle = await prisma.article.create({
          data: {
            title: article.title,
            url: article.url,
            summary: null,
            thumbnail: article.thumbnail || null,
            content: article.content || null,
            publishedAt: adjustTimezoneForArticle(article.publishedAt, source.name),
            bookmarks: article.bookmarks || 0,
            sourceId: source.id,
            category: category,
            contentUpdatedAt: new Date(),
            ...(tagConnections.length > 0 && {
              tags: {
                connect: tagConnections
              }
            })
          }
        });

        if (process.env.SKIP_POST_SAVE_ENRICHMENT !== '1') {
          const enricher = enricherFactory.getEnricher(article.url);
          if (enricher) {
            try {
              console.error(`   🔍 エンリッチメント実行: ${article.title.substring(0, 40)}...`);
              const enrichedData = await enricher.enrich(article.url);

              if (enrichedData && enrichedData.content) {
                const originalContentLength = article.content?.length || 0;
                const enrichedContentLength = enrichedData.content.length;

                if (enrichedContentLength > originalContentLength && enrichedContentLength >= 500) {
                  await prisma.article.update({
                    where: { id: savedArticle.id },
                    data: {
                      content: enrichedData.content,
                      contentUpdatedAt: new Date(),
                      ...(enrichedData.thumbnail && { thumbnail: enrichedData.thumbnail })
                    }
                  });
                  console.error(`   ✅ エンリッチメント成功: ${enrichedData.content.length}文字`);
                } else {
                  console.warn(`   ⚠️ エンリッチメント結果が不十分: ${enrichedContentLength}文字（元: ${originalContentLength}文字）`);
                }
              } else {
                console.error('   ⚠️ エンリッチメント失敗: コンテンツなし');
              }
            } catch (enrichError) {
              console.error('   ⚠️ エンリッチメントエラー:', enrichError instanceof Error ? enrichError.message : String(enrichError));
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        // Title already added to Set in Mutex-protected section above
        newCount++;
      } catch (error: any) {
        // Rollback title reservation on error
        await recentTitlesMutex.runExclusive(() => {
          recentTitlesSet.delete(article.title);
        });

        if (error?.code === 'P2002' && error?.meta?.target?.includes('url')) {
          duplicateCount++;
        } else {
          console.error(`   記事保存エラー: ${article.title}`, error instanceof Error ? error.message : String(error));
        }
      }
    }

    if (newCount > 0 || duplicateCount > 0) {
      console.error(`   ✅ 新規: ${newCount}件, 重複: ${duplicateCount}件`);
    }

    result.newArticles = newCount;
    result.duplicates = duplicateCount;
    return result;
  } catch (error) {
    failed = true;
    console.error(`❌ ${source.name} のフェッチエラー:`, error instanceof Error ? error.message : String(error));
    return result;
  } finally {
    const sourceDuration = Math.round((Date.now() - sourceStart) / 1000);
    const suffix = failed ? ' (failed)' : '';
    console.error(`   [${source.name}] Duration: ${sourceDuration}s, Articles: ${fetchedArticlesCount}, New: ${newCount}${suffix}`);
  }
}

async function collectFeeds(sourceTypes?: string[]): Promise<CollectResult> {
  console.error('📡 フィード収集を開始します...');
  console.error(`   SKIP_POST_SAVE_ENRICHMENT: ${process.env.SKIP_POST_SAVE_ENRICHMENT || 'not set'}`);
  if (sourceTypes && sourceTypes.length > 0) {
    console.error(`   対象ソース: ${sourceTypes.join(', ')}`);
  }
  const startTime = Date.now();

  // ContentEnricherFactoryのインスタンスを作成
  const enricherFactory = new ContentEnricherFactory();
  const concurrency = resolveCollectConcurrency();
  console.error(`   COLLECT_FEEDS_CONCURRENCY: ${concurrency} (${concurrency === 1 ? 'シーケンシャル' : '並列実行'})`);

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
    const recentArticles: Array<{ title: string }> = sources.length > 0
      ? await prisma.article.findMany({
          where: {
            publishedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          },
          select: { title: true }
        })
      : [];

    // Convert to Set for O(1) lookups and thread-safe mutations
    const recentTitlesSet = new Set(recentArticles.map(a => a.title));
    const recentTitlesMutex = new Mutex();

    const limit = pLimit(concurrency);
    const tasks = sources.map(source =>
      limit(() => processSource({ source, recentTitlesSet, recentTitlesMutex, enricherFactory }))
    );

    const settledResults = await Promise.allSettled(tasks);

    let totalNewArticles = 0;
    let totalDuplicates = 0;

    settledResults.forEach(result => {
      if (result.status === 'fulfilled') {
        totalNewArticles += result.value.newArticles;
        totalDuplicates += result.value.duplicates;
      } else {
        console.error('⚠️ ソース処理で未処理の例外が発生しました:', result.reason);
      }
    });

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`\n📊 収集完了: 新規${totalNewArticles}件, 重複${totalDuplicates}件 (${duration}秒)`);

    if (totalNewArticles > 0) {
      console.error('🔄 キャッシュを無効化中...');
      await cacheInvalidator.onBulkImport();

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

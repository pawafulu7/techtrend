import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { BaseFetcher } from '../base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import { parseRSSDate } from '@/lib/utils/date';
import { extractContent, checkContentQuality } from '@/lib/utils/content-extractor';
import { ContentEnricherFactory } from '@/lib/enrichers';
import { logger } from '@/lib/cli/utils/logger';

interface OpenAIRSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
  'content:encoded'?: string;
  categories?: string[];
  creator?: string;
  guid?: string;
}

export class OpenAIBlogFetcher extends BaseFetcher {
  private parser: Parser<unknown, OpenAIRSSItem>;

  constructor(source: Source) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: [
          ['content:encoded', 'contentEncoded'],
        ],
      },
    });
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    // 30日前の日付を計算
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 現在日時を取得（未来日付フィルタ用）
    const now = new Date();

    try {
      logger.info('[OpenAI Blog] 記事を取得中...');

      const feed = await this.retry(() =>
        this.parser.parseURL('https://openai.com/blog/rss.xml')
      );

      // ContentEnricherFactoryのインスタンス作成
      const enricherFactory = new ContentEnricherFactory();

      let processedCount = 0;
      const maxArticles = 20; // 最大20件

      for (const item of feed.items || []) {
        if (processedCount >= maxArticles) break;

        try {
          if (!item.title || !item.link) continue;

          const publishedAt = item.pubDate ? parseRSSDate(item.pubDate) : new Date();

          // 30日以内かつ未来でない記事のみ処理
          if (publishedAt < thirtyDaysAgo || publishedAt > now) continue;

          // コンテンツを抽出
          let content = extractContent(item as unknown as Record<string, unknown>);
          let thumbnail: string | undefined;

          // コンテンツエンリッチメント（2000文字未満の場合のみ実行）
          if (content && content.length < 2000) {
            const enricher = enricherFactory.getEnricher(item.link);
            if (enricher) {
              try {
                logger.info(`[OpenAI Blog] エンリッチメント実行: ${item.link}`);
                const enrichedData = await enricher.enrich(item.link);
                if (enrichedData && enrichedData.content && enrichedData.content.length > content.length) {
                  content = enrichedData.content;
                  thumbnail = enrichedData.thumbnail || undefined;
                  logger.info(`[OpenAI Blog] エンリッチメント成功: ${content.length}文字`);
                }
              } catch (enrichError) {
                logger.error(`[OpenAI Blog] エンリッチメント失敗: ${enrichError}`);
                // エラー時は元のコンテンツを使用
              }
            }
          }

          // コンテンツ品質チェック
          const contentCheck = checkContentQuality(content, item.title);
          if (contentCheck.warning) {
            logger.warn(`[OpenAI Blog] コンテンツ品質警告: ${contentCheck.warning}`);
          }

          const article: CreateArticleInput = {
            title: this.sanitizeText(item.title),
            url: this.normalizeUrl(item.link),
            summary: undefined, // 要約は後で生成
            content: content || undefined,
            publishedAt,
            sourceId: this.source.id,
            tagNames: this.generateOpenAITags(item.categories),
          };

          // サムネイルがある場合は追加
          if (thumbnail) {
            article.thumbnail = thumbnail;
          } else if (article.content) {
            // コンテンツからサムネイルを抽出
            const extractedThumbnail = this.extractThumbnail(article.content);
            if (extractedThumbnail) {
              article.thumbnail = extractedThumbnail;
            }
          }

          articles.push(article);
          processedCount++;
        } catch (itemError) {
          logger.error(`[OpenAI Blog] 記事処理エラー: ${itemError}`);
          errors.push(itemError instanceof Error ? itemError : new Error(String(itemError)));
        }
      }

      logger.info(`[OpenAI Blog] ${articles.length}件の記事を取得しました`);
    } catch (error) {
      logger.error(`[OpenAI Blog] フィード取得エラー: ${error}`);
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    return { articles, errors };
  }

  private generateOpenAITags(categories?: string[]): string[] {
    const tags = ['OpenAI', 'AI', 'LLM', 'ChatGPT'];
    if (categories && categories.length > 0) {
      return [...tags, ...categories];
    }
    return tags;
  }
}
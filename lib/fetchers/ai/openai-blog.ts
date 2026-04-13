import { Source } from '@/lib/prisma-exports';
import Parser from 'rss-parser';
import { BaseFetcher } from '../base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import { parseRSSDate } from '@/lib/utils/date';
import {
  extractContent,
  checkContentQuality,
} from '@/lib/utils/content/content-extractor';
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
        item: [['content:encoded', 'contentEncoded']],
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

      let processedCount = 0;
      const maxArticles = 20; // 最大20件

      for (const item of feed.items || []) {
        if (processedCount >= maxArticles) break;

        try {
          if (!item.title || !item.link) continue;

          const publishedAt = item.pubDate
            ? parseRSSDate(item.pubDate)
            : new Date();

          // 30日以内かつ未来でない記事のみ処理
          if (publishedAt < thirtyDaysAgo || publishedAt > now) continue;

          // コンテンツを抽出
          // Note: Enrichment is handled by collect-feeds.ts standard flow
          // with proper timeout protection via Worker Threads
          const content = extractContent(
            item as unknown as Record<string, unknown>
          );

          // コンテンツ品質チェック
          const contentCheck = checkContentQuality(content, item.title);
          if (contentCheck.warning) {
            logger.debug(
              `[OpenAI Blog] コンテンツ品質警告: ${contentCheck.warning}`
            );
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

          // コンテンツからサムネイルを抽出
          if (article.content) {
            const extractedThumbnail = this.extractThumbnail(article.content);
            if (extractedThumbnail) {
              article.thumbnail = extractedThumbnail;
            }
          }

          articles.push(article);
          processedCount++;
        } catch (itemError) {
          logger.error(`[OpenAI Blog] 記事処理エラー: ${itemError}`);
          errors.push(
            itemError instanceof Error
              ? itemError
              : new Error(String(itemError))
          );
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

import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { BaseFetcher } from '../base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import { parseRSSDate } from '@/lib/utils/date';
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

          const publishedAt = item.pubDate ? parseRSSDate(item.pubDate) : new Date();

          // 30日以内の記事のみ処理
          if (publishedAt < thirtyDaysAgo) continue;

          articles.push({
            title: item.title,
            url: item.link,
            summary: undefined, // 要約は後で生成
            publishedAt,
            sourceId: this.source.id,
            thumbnail: undefined,
            // categoryは記事保存時に設定（ai_mlカテゴリ）
          });

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
}
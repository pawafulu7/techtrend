import Parser from 'rss-parser';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/lib/types/article';
import { parseRSSDate } from '@/lib/utils/date';

interface QiitaPopularItem {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  creator?: string;
  content?: string;
  contentSnippet?: string;
  guid?: string;
  categories?: string[];
}

export class QiitaPopularFetcher extends BaseFetcher {
  private parser: Parser<any, QiitaPopularItem>;

  constructor(source: any) {
    super(source);
    this.parser = new Parser();
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    try {
      console.log('[Qiita Popular] 人気記事フィードを取得中...');
      const feed = await this.retry(() => this.parser.parseURL(this.source.url));
      
      if (!feed.items || feed.items.length === 0) {
        console.log('[Qiita Popular] 記事が見つかりませんでした');
        return { articles, errors };
      }

      console.log(`[Qiita Popular] ${feed.items.length}件の人気記事を取得`);

      // 最大30件に制限
      const limitedItems = feed.items.slice(0, 30);

      for (const item of limitedItems) {
        try {
          if (!item.title || !item.link) continue;

          const article: CreateArticleInput = {
            title: this.sanitizeText(item.title),
            url: this.normalizeUrl(item.link),
            summary: undefined, // 要約は後で日本語で生成
            content: item.content || item.contentSnippet || '',
            publishedAt: item.isoDate ? new Date(item.isoDate) :
                        item.pubDate ? parseRSSDate(item.pubDate) : new Date(),
            sourceId: this.source.id,
            tagNames: item.categories || [],
          };

          // コンテンツからサムネイルを抽出
          if (article.content) {
            const thumbnail = this.extractThumbnail(article.content);
            if (thumbnail) {
              article.thumbnail = thumbnail;
            }
          }

          articles.push(article);
        } catch (error) {
          errors.push(new Error(`Failed to parse item: ${error instanceof Error ? error.message : String(error)}`));
        }
      }

      console.log(`[Qiita Popular] ${articles.length}件の記事を処理`);
    } catch (error) {
      errors.push(new Error(`Failed to fetch Qiita popular feed: ${error instanceof Error ? error.message : String(error)}`));
    }

    return { articles, errors };
  }
}
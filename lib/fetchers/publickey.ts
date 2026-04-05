import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { BaseFetcher } from './base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import { parseRSSDate } from '@/lib/utils/date';
import { ContentEnricherFactory } from '@/lib/enrichers';
import logger from '@/lib/logger';
import { extractTagsFromCategories } from '@/lib/utils/tag/tag-extractor';

interface PublickeyRSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  'dc:date'?: string;
  description?: string;
  'content:encoded'?: string;
  categories?: string[];
}

export class PublickeyFetcher extends BaseFetcher {
  private parser: Parser<unknown, PublickeyRSSItem>;

  constructor(source: Source) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: [
          ['dc:date', 'dcDate'],
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

    // Content thresholds
    const RSS_SUFFICIENT_LENGTH = 200;
    const MIN_CONTENT_LENGTH = 100;

    // Note: ContentEnricherFactory instantiation in loop is acceptable
    // for low-volume sources (Publickey: few articles/day).
    // TODO: Move outside loop if article count increases significantly.

    try {
      const feed = await this.retry(() =>
        this.parser.parseURL(this.source.url)
      );

      for (const item of feed.items || []) {
        try {
          if (!item.title || !item.link) continue;

          const publishedAt = item.pubDate
            ? parseRSSDate(item.pubDate)
            : item['dc:date']
              ? new Date(item['dc:date'])
              : new Date();

          // 30日以内の記事のみ処理
          if (publishedAt < thirtyDaysAgo) {
            continue;
          }

          let content = item['content:encoded'] || item.description || '';
          let thumbnail: string | undefined;

          // RSSデータが不足している場合（< 200文字）、Enricherを呼ぶ
          const rssContentLength = content.length;
          if (rssContentLength < RSS_SUFFICIENT_LENGTH) {
            try {
              logger.info(
                {
                  url: item.link,
                  title: item.title,
                  rssContentLength,
                  skipThreshold: MIN_CONTENT_LENGTH,
                },
                '[Publickey] RSS content insufficient, trying enricher'
              );

              const enricherFactory = new ContentEnricherFactory();
              const enrichedData = await enricherFactory.trySequential(
                item.link
              );

              // サムネイルはコンテンツ条件に関わらず独立して取得
              if (enrichedData?.thumbnail && !thumbnail) {
                thumbnail = enrichedData.thumbnail;
              }

              if (
                enrichedData?.content &&
                enrichedData.content.length >= RSS_SUFFICIENT_LENGTH
              ) {
                content = enrichedData.content;
                logger.info(
                  {
                    url: item.link,
                    title: item.title,
                    rssContentLength,
                    enrichedLength: enrichedData.content.length,
                  },
                  '[Publickey] Enrichment successful'
                );
              } else if (rssContentLength < MIN_CONTENT_LENGTH) {
                // Enrichment failed and RSS data insufficient - skip article
                logger.warn(
                  {
                    url: item.link,
                    title: item.title,
                    rssContentLength,
                    enrichedLength: enrichedData?.content?.length || 0,
                    reason: 'rss_and_enrichment_both_insufficient',
                    skipThreshold: MIN_CONTENT_LENGTH,
                  },
                  '[Publickey] Skipping article due to content insufficiency'
                );
                continue; // Skip this article
              }
              // else: RSS 100-199 chars, Enricher failed -> use RSS content (intentional)
            } catch (enrichError) {
              logger.error(
                {
                  err: enrichError,
                  url: item.link,
                  title: item.title,
                  rssContentLength,
                },
                '[Publickey] Enrichment error'
              );

              if (rssContentLength < MIN_CONTENT_LENGTH) {
                // Enrichment error and RSS data insufficient - skip article
                logger.warn(
                  {
                    url: item.link,
                    title: item.title,
                    rssContentLength,
                    reason: 'enrichment_error_and_rss_insufficient',
                    skipThreshold: MIN_CONTENT_LENGTH,
                  },
                  '[Publickey] Skipping article due to enrichment error'
                );
                continue; // Skip this article
              }
              // else: RSS >= 100 chars, Enricher error -> use RSS content (fallback)
            }
          }

          const article: CreateArticleInput = {
            title: this.sanitizeText(item.title),
            url: this.normalizeUrl(item.link),
            summary: undefined, // 要約は後で日本語で生成
            content: content || undefined,
            publishedAt,
            sourceId: this.source.id,
            tagNames: extractTagsFromCategories(item.categories),
          };

          // コンテンツからサムネイルを抽出（enriched thumbnailがない場合）
          if (article.content && !thumbnail) {
            const extractedThumbnail = this.extractThumbnail(article.content);
            if (extractedThumbnail) {
              thumbnail = extractedThumbnail;
            }
          }

          if (thumbnail) {
            article.thumbnail = thumbnail;
          }

          articles.push(article);
        } catch (_error) {
          errors.push(
            new Error(
              `Failed to parse item: ${_error instanceof Error ? _error.message : String(_error)}`
            )
          );
        }
      }
    } catch (_error) {
      errors.push(
        new Error(
          `Failed to fetch RSS feed: ${_error instanceof Error ? _error.message : String(_error)}`
        )
      );
    }

    return { articles, errors };
  }
}

import { BaseFetcher } from '../base';
import { FetchResult, CreateArticleInput } from '@/types/fetchers';
import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { parseRSSDate } from '@/lib/utils/date';
import logger from '@/lib/logger';
import { getContentFromItem, getAuthorFromItem } from '@/lib/types/rss';

/**
 * 企業ブログフェッチャーの基底クラス
 * 各企業のRSSフィードから記事を取得する共通処理を提供
 */
export abstract class BaseCorporateFetcher extends BaseFetcher {
  protected parser: Parser;
  private maxArticlesPerCompany = 30;
  private thirtyDaysAgo: Date;

  constructor(source: Source) {
    super(source);
    this.parser = new Parser({
      timeout: 15000, // 15秒のHTTPタイムアウトを設定
      customFields: {
        item: [
          ['dc:creator', 'dcCreator'],
          ['content:encoded', 'contentEncoded'],
        ],
      },
      headers: {
        'User-Agent': 'TechTrend/1.0 (https://techtrend.example.com)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });

    // 30日前の日付を計算
    this.thirtyDaysAgo = new Date();
    this.thirtyDaysAgo.setDate(this.thirtyDaysAgo.getDate() - 30);

    // 環境変数から最大記事数を取得（堅牢化: NaN/負値ガード＋上限）
    const maxArticles = process.env.MAX_ARTICLES_PER_COMPANY;
    if (maxArticles != null) {
      const n = Number.parseInt(maxArticles, 10);
      if (Number.isFinite(n) && n > 0) {
        // 過負荷防止の上限（必要なら調整）
        this.maxArticlesPerCompany = Math.min(n, 100);
      }
    }
  }

  /**
   * RSSフィードのURLを返す（各企業フェッチャーで実装）
   */
  protected abstract getRssUrl(): string;

  /**
   * 企業名を返す（各企業フェッチャーで実装）
   */
  protected abstract getCompanyName(): string;

  /**
   * 企業名の正規化（必要に応じてオーバーライド）
   */
  protected getNormalizedCompanyName(): string {
    return this.getCompanyName();
  }

  /**
   * 記事の取得処理
   */
  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    try {
      logger.info(`Fetching articles from ${this.getCompanyName()}...`);

      const feed = await this.retry(() => this.parser.parseURL(this.getRssUrl()));

      if (!feed.items || feed.items.length === 0) {
        logger.info(`No articles found for ${this.getCompanyName()}`);
        return { articles: [], errors: [] };
      }

      let processedCount = 0;
      for (const item of feed.items) {
        try {
          // 基本的なバリデーション
          if (!item.title || !item.link) continue;

          // 日付の堅牢なパース（isoDateが不正ならpubDateにフォールバック）
          let publishedAt = new Date();
          if (item.isoDate) {
            const d = new Date(item.isoDate as string);
            if (!isNaN(d.getTime())) {
              publishedAt = d;
            } else if (item.pubDate) {
              publishedAt = parseRSSDate(item.pubDate as string);
            }
          } else if (item.pubDate) {
            publishedAt = parseRSSDate(item.pubDate as string);
          }

          if (publishedAt < this.thirtyDaysAgo) {
            continue;
          }

          // 日本語チェック（content:encodedを含めて誤除外を防止）
          const textToCheck = getContentFromItem(item)
                            || item.description
                            || item.summary
                            || '';
          const hasJapanese = this.containsJapanese(item.title) ||
                            this.containsJapanese(textToCheck);

          if (!hasJapanese) {
            continue;
          }

          // イベント記事の除外（環境変数の解釈を厳密化）
          const excludeEvents = !/^(false|0|no)$/i.test(String(process.env.EXCLUDE_EVENT_ARTICLES ?? 'true'));
          if (excludeEvents && this.isEventArticle(item.title, item.link)) {
            continue;
          }

          // 記事数制限チェック
          if (processedCount >= this.maxArticlesPerCompany) {
            break;
          }

          // タグの準備（RSSフィードのカテゴリから抽出のみ）
          const tags = this.extractTags(item);
          const finalTags = tags;

          // コンテンツの取得（WordPress系RSS対応でcontent:encodedを優先）
          const content = getContentFromItem(item) || '';

          const article: CreateArticleInput = {
            title: this.sanitizeText(item.title),
            url: this.normalizeUrl(item.link),
            summary: undefined, // 要約は後で日本語で生成
            content: this.sanitizeText(content),
            thumbnail: this.extractThumbnail(content) || undefined,
            publishedAt,
            sourceId: this.source.id, // 正しい企業別ソースIDを使用
            tagNames: finalTags,
            author: getAuthorFromItem(item) || this.getCompanyName(),
          };

          // サムネイル抽出（enclosure）
          if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
            article.thumbnail = item.enclosure.url;
          }

          articles.push(article);
          processedCount++;

        } catch (error) {
          errors.push(new Error(
            `Failed to parse item from ${this.getCompanyName()}: ${error instanceof Error ? error.message : String(error)}`
          ));
        }
      }

      logger.info(`${this.getCompanyName()}: Fetched ${articles.length} articles`);

    } catch (error) {
      const errorMessage = `Failed to fetch ${this.getCompanyName()} feed: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMessage);
      errors.push(new Error(errorMessage));
    }

    // 念のためpublishedAt降順にソート（フィード順のばらつき対策）
    articles.sort((a, b) => (b.publishedAt as Date).getTime() - (a.publishedAt as Date).getTime());
    return { articles, errors };
  }

  /**
   * 日本語文字が含まれているかチェック
   */
  protected containsJapanese(text: string): boolean {
    if (!text) return false;
    // CJK末尾（〜9FFF）と和文記号（3000-303F）、半角カナも含める
    const japaneseRegex = /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF65-\uFF9F]/u;
    return japaneseRegex.test(text);
  }

  /**
   * イベント記事かどうかチェック
   */
  protected isEventArticle(title: string, url: string): boolean {
    const eventKeywords = [
      // イベント関連
      'イベント', 'カンファレンス', 'セミナー', 'ミートアップ', 'meetup',
      'conference', 'summit', 'expo', '展示会', 'ウェビナー', 'webinar',
      '勉強会', 'ハッカソン', 'hackathon', 'コンテスト', 'contest',

      // 登壇・発表関連
      '登壇', '発表', 'LT', 'ライトニングトーク', 'プレゼン',
      'presentation', 'talk', 'session', 'スピーカー', 'speaker',

      // 参加・レポート関連
      '参加レポート', '参加報告', '開催レポート', '開催報告',
      'イベントレポート', 'カンファレンスレポート',

      // 告知・募集関連
      '開催のお知らせ', '募集', '参加者募集', '登壇者募集',
      'Call for', 'CFP', '申し込み', '受付中', '締切',

      // 特定のイベント名
      'AWS Summit', 'Google I/O', 'WWDC', 'Build',
      'Tech Conference', 'DevFest', 'DroidKaigi', 'iOSDC'
    ];

    const lowerTitle = title.toLowerCase();
    const lowerUrl = url.toLowerCase();

    return eventKeywords.some(keyword =>
      lowerTitle.includes(keyword.toLowerCase()) ||
      lowerUrl.includes(keyword.toLowerCase())
    );
  }

  /**
   * タグ抽出（基本実装、必要に応じてオーバーライド）
   */
  protected extractTags(item: unknown): string[] {
    const tags: string[] = [];

    // Type-safe category extraction
    if (typeof item === 'object' && item !== null) {
      const itemAny = item as any;
      if (itemAny.categories && Array.isArray(itemAny.categories)) {
        itemAny.categories.forEach((category: string) => {
          const tag = (category ?? '').trim();
          if (tag && !tags.some(t => t.toLowerCase() === tag.toLowerCase())) {
            tags.push(tag);
          }
        });
      }
    }

    return tags;
  }
}
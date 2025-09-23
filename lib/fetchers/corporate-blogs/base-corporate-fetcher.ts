import { BaseFetcher } from '../base';
import { FetchResult, CreateArticleInput } from '@/types/fetchers';
import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { parseRSSDate } from '@/lib/utils/date';
import logger from '@/lib/logger';

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

    // 環境変数から最大記事数を取得
    const maxArticles = process.env.MAX_ARTICLES_PER_COMPANY;
    if (maxArticles) {
      this.maxArticlesPerCompany = parseInt(maxArticles);
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

          // 日付チェック
          const publishedAt = item.isoDate
            ? new Date(item.isoDate)
            : item.pubDate
              ? parseRSSDate(item.pubDate)
              : new Date();

          if (publishedAt < this.thirtyDaysAgo) {
            continue;
          }

          // 日本語チェック
          const textToCheck = item.description || item.content ||
                            item.summary || item.contentSnippet || '';
          const hasJapanese = this.containsJapanese(item.title) ||
                            this.containsJapanese(textToCheck);

          if (!hasJapanese) {
            continue;
          }

          // イベント記事の除外
          const excludeEvents = process.env.EXCLUDE_EVENT_ARTICLES !== 'false';
          if (excludeEvents && this.isEventArticle(item.title, item.link)) {
            continue;
          }

          // 記事数制限チェック
          if (processedCount >= this.maxArticlesPerCompany) {
            break;
          }

          // タグの準備（企業名を最初に追加）
          const tags = this.extractTags(item);
          const companyTagName = this.getNormalizedCompanyName();
          const finalTags = [companyTagName, ...tags.filter(tag => tag !== companyTagName)];

          // 企業テックブログタグを追加
          if (!finalTags.includes('企業テックブログ')) {
            finalTags.push('企業テックブログ');
          }

          // コンテンツの取得
          const content = item.content || item.contentSnippet || item.description || '';

          const article: CreateArticleInput = {
            title: this.sanitizeText(item.title),
            url: this.normalizeUrl(item.link),
            summary: undefined, // 要約は後で日本語で生成
            content: this.sanitizeText(content),
            thumbnail: this.extractThumbnail(content) || undefined,
            publishedAt,
            sourceId: this.source.id, // 正しい企業別ソースIDを使用
            tagNames: finalTags,
            author: item.creator || item['dc:creator'] || this.getCompanyName(),
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

    return { articles, errors };
  }

  /**
   * 日本語文字が含まれているかチェック
   */
  protected containsJapanese(text: string): boolean {
    if (!text) return false;
    const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
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
  protected extractTags(item: any): string[] {
    const tags: string[] = [];

    // カテゴリからタグ抽出
    if (item.categories && Array.isArray(item.categories)) {
      item.categories.forEach((category: string) => {
        if (category && !tags.includes(category)) {
          tags.push(category);
        }
      });
    }

    return tags;
  }
}
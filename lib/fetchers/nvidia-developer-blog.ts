/**
 * NVIDIA Developer Blog Fetcher
 * NVIDIA技術ブログからAI/GPU関連の記事を取得
 */

import { Source } from '@/lib/prisma-exports';
import Parser from 'rss-parser';
import { BaseFetcher } from './base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import { parseRSSDate } from '@/lib/utils/date';
import logger from '@/lib/logger';
import { aiLLMFilter } from '@/lib/filters/ai-llm-filter';

export class NVIDIADeveloperBlogFetcher extends BaseFetcher {
  private parser: Parser;

  constructor(source: Source) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: ['dc:creator', 'category']
      }
    });
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    // 30日前を基準日とする
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      logger.info('NVIDIA Developer Blog記事取得開始');

      // NVIDIAのAtomフィードURL
      const feedUrl = 'https://developer.nvidia.com/blog/feed';

      const feed = await this.retry(() =>
        this.parser.parseURL(feedUrl)
      );

      if (!feed.items || feed.items.length === 0) {
        logger.warn('NVIDIA Developer Blog: 記事が見つかりませんでした');
        return { articles, errors };
      }

      // 最大50件まで取得
      const maxArticles = 50;
      let processedCount = 0;
      let filteredCount = 0;

      for (const item of feed.items) {
        if (processedCount >= maxArticles) break;

        if (!item.title || !item.link) {
          continue;
        }

        const publishedAt = item.pubDate ?
          parseRSSDate(item.pubDate) : new Date();

        // 30日以内の記事のみ
        if (publishedAt < thirtyDaysAgo) {
          continue;
        }

        // AI/LLMフィルタリング
        const articleContent = {
          title: item.title,
          summary: item.contentSnippet || item.summary,
          content: item.content
        };

        if (!aiLLMFilter.isAILLMArticle(articleContent)) {
          filteredCount++;
          continue;
        }

        // カテゴリとタグの抽出
        const categories = this.extractCategories(item);
        const _tags = this.extractTags(item, categories);

        // コンテンツの生成
        const content = this.generateContent(item);

        // サムネイル抽出
        const thumbnail = this.extractThumbnailFromContent(item.content || '');

        const article: CreateArticleInput = {
          title: this.cleanTitle(item.title),
          url: this.normalizeUrl(item.link),
          content,
          summary: undefined, // 要約は生成サービスに任せる
          publishedAt,
          sourceId: this.source.id,
          thumbnail,
        };

        articles.push(article);
        processedCount++;
      }

      logger.info(
        `NVIDIA Developer Blog: ${processedCount}件の記事を取得 ` +
        `(${filteredCount}件をフィルタで除外)`
      );

    } catch (error) {
      const errorMessage = `NVIDIA Developer Blog取得エラー: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMessage);
      errors.push(new Error(errorMessage));
    }

    return { articles, errors };
  }

  /**
   * タイトルのクリーニング
   */
  private cleanTitle(title: string): string {
    return title
      .replace(/\s+/g, ' ')
      .replace(/^\s+|\s+$/g, '')
      .replace(/&#8211;/g, '–')
      .replace(/&#8217;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&'); // ampersandは最後にデコード
  }

  /**
   * カテゴリの抽出
   */
  private extractCategories(item: any): string[] {
    const categories: string[] = [];

    // RSSのcategoryフィールド
    if (item.categories && Array.isArray(item.categories)) {
      categories.push(...item.categories);
    } else if (item.category) {
      if (Array.isArray(item.category)) {
        categories.push(...item.category);
      } else if (typeof item.category === 'string') {
        categories.push(item.category);
      }
    }

    return categories.filter(cat => cat && cat.length > 0);
  }

  /**
   * タグの抽出（カテゴリを元に、AI関連キーワードを追加）
   */
  private extractTags(item: any, categories: string[]): string[] {
    const tags = new Set<string>();

    // カテゴリをタグに追加
    categories.forEach(cat => {
      tags.add(cat.toLowerCase());
    });

    // 記事から抽出したAI/LLMキーワードを追加
    const articleContent = {
      title: item.title || '',
      summary: item.contentSnippet || item.summary || '',
      content: item.content || ''
    };

    const matchedKeywords = aiLLMFilter.getMatchedKeywords(articleContent);

    // 主要なキーワードをタグとして追加（最大10個）
    matchedKeywords.slice(0, 10).forEach(keyword => {
      // 短すぎるキーワードは除外
      if (keyword.length >= 2) {
        tags.add(keyword.toLowerCase());
      }
    });

    // NVIDIA特有のタグを追加
    const nvidiaKeywords = ['gpu', 'cuda', 'tensorrt', 'triton', 'rapids', 'dgx'];
    const text = `${item.title} ${item.content || ''}`.toLowerCase();

    nvidiaKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        tags.add(keyword);
      }
    });

    return Array.from(tags);
  }

  /**
   * コンテンツの生成
   */
  private generateContent(item: any): string {
    let content = '';

    // 著者情報
    if (item['dc:creator']) {
      content += `Author: ${item['dc:creator']}\n\n`;
    }

    // カテゴリ
    const categories = this.extractCategories(item);
    if (categories.length > 0) {
      content += `Categories: ${categories.join(', ')}\n\n`;
    }

    // 要約またはコンテンツスニペット
    if (item.contentSnippet) {
      content += `${item.contentSnippet}\n\n`;
    } else if (item.summary) {
      content += `${item.summary}\n\n`;
    }

    // フルコンテンツ（HTMLタグを除去）
    if (item.content) {
      const cleanContent = this.sanitizeText(item.content);
      content += cleanContent;
    }

    // リンク
    content += `\n\nRead more: ${item.link}`;

    return content;
  }

  /**
   * コンテンツからサムネイルを抽出
   */
  private extractThumbnailFromContent(content: string): string | undefined {
    if (!content) return undefined;

    // og:image
    const ogMatch = content.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
    if (ogMatch && ogMatch[1]) {
      return this.normalizeImageUrl(ogMatch[1]);
    }

    // 最初のimg要素
    const imgMatch = content.match(/<img[^>]*src="([^"]+)"[^>]*>/i);
    if (imgMatch && imgMatch[1]) {
      return this.normalizeImageUrl(imgMatch[1]);
    }

    // NVIDIAのデフォルト画像URL（存在する場合）
    const nvidiaImageMatch = content.match(/https:\/\/developer\.nvidia\.com[^"'\s]+(\.jpg|\.png|\.webp)/i);
    if (nvidiaImageMatch) {
      return nvidiaImageMatch[0];
    }

    return undefined;
  }

  /**
   * 画像URLの正規化
   */
  private normalizeImageUrl(url: string): string {
    // 相対URLを絶対URLに変換
    if (url.startsWith('/')) {
      return `https://developer.nvidia.com${url}`;
    }

    // プロトコルなしのURL
    if (url.startsWith('//')) {
      return `https:${url}`;
    }

    return url;
  }
}
/**
 * DeepMind Blog Fetcher
 * DeepMindの研究ブログからAI関連の記事を取得
 * 302リダイレクト対応
 */

import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { BaseFetcher } from './base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import { parseRSSDate } from '@/lib/utils/date';
import logger from '@/lib/logger';
import { aiLLMFilter } from '@/lib/filters/ai-llm-filter';

export class DeepMindBlogFetcher extends BaseFetcher {
  private parser: Parser;

  constructor(source: Source) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: ['author', 'category', 'media:thumbnail', 'media:content']
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
      logger.info('DeepMind Blog記事取得開始');

      // DeepMindのRSSフィードURL（302リダイレクトあり）
      const feedUrl = 'https://deepmind.google/blog/rss.xml';

      const feed = await this.retry(async () => {
        try {
          return await this.parser.parseURL(feedUrl);
        } catch (error) {
          // リダイレクトエラーの場合、代替URLを試す
          if (error instanceof Error && error.message.includes('redirect')) {
            logger.warn('DeepMind Blog: リダイレクトエラー、代替URLを試行');
            // 代替URL（実際のリダイレクト先）
            return await this.parser.parseURL('https://deepmind.google/discover/blog/rss.xml');
          }
          throw error;
        }
      });

      if (!feed.items || feed.items.length === 0) {
        logger.warn('DeepMind Blog: 記事が見つかりませんでした');
        return { articles, errors };
      }

      // 最大40件まで取得
      const maxArticles = 40;
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

        // DeepMindは基本的にすべてAI研究だが、念のためフィルタ
        const filterResult = aiLLMFilter.analyze(articleContent);

        // DeepMindの記事は信頼度閾値を低めに設定（0.2以上なら採用）
        if (!filterResult.isAILLM && filterResult.confidence < 0.2) {
          filteredCount++;
          logger.debug(`DeepMind Blog: フィルタで除外 - ${item.title} (confidence: ${filterResult.confidence})`);
          continue;
        }

        // カテゴリとタグの抽出
        const categories = this.extractCategories(item);
        const _tags = this.extractTags(item, categories, filterResult.matchedKeywords);

        // コンテンツの生成
        const content = this.generateContent(item, filterResult.matchedKeywords);

        // サムネイル抽出
        const thumbnail = this.extractItemThumbnail(item);

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
        `DeepMind Blog: ${processedCount}件の記事を取得 ` +
        `(${filteredCount}件をフィルタで除外)`
      );

    } catch (error) {
      const errorMessage = `DeepMind Blog取得エラー: ${error instanceof Error ? error.message : String(error)}`;
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
      .replace(/&#8212;/g, '—')
      .replace(/&#8217;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, ' ')
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

    // DeepMind特有のカテゴリを追加
    const title = (item.title || '').toLowerCase();
    const content = (item.content || '').toLowerCase();

    if (title.includes('alphafold') || content.includes('alphafold')) {
      categories.push('AlphaFold');
    }
    if (title.includes('alphago') || content.includes('alphago')) {
      categories.push('AlphaGo');
    }
    if (title.includes('gemini') || content.includes('gemini')) {
      categories.push('Gemini');
    }
    if (title.includes('sparrow') || content.includes('sparrow')) {
      categories.push('Sparrow');
    }

    return categories.filter(cat => cat && cat.length > 0);
  }

  /**
   * タグの抽出
   */
  private extractTags(item: any, categories: string[], matchedKeywords: string[]): string[] {
    const tags = new Set<string>();

    // カテゴリをタグに追加
    categories.forEach(cat => {
      tags.add(cat.toLowerCase());
    });

    // AI/LLMキーワードを追加（最大15個）
    matchedKeywords.slice(0, 15).forEach(keyword => {
      if (keyword.length >= 2) {
        tags.add(keyword.toLowerCase());
      }
    });

    // DeepMind特有のタグを追加
    const deepmindKeywords = [
      'reinforcement learning', 'rl', 'deep learning', 'neural network',
      'protein folding', 'scientific discovery', 'ai safety', 'alignment',
      'multimodal', 'language model', 'vision', 'robotics', 'game ai',
      'mathematics', 'reasoning', 'research', 'breakthrough'
    ];

    const text = `${item.title} ${item.content || ''}`.toLowerCase();

    deepmindKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        tags.add(keyword.replace(/\s+/g, '-'));
      }
    });

    return Array.from(tags);
  }

  /**
   * コンテンツの生成
   */
  private generateContent(item: any, matchedKeywords: string[]): string {
    let content = '';

    // 研究分野のハイライト
    if (matchedKeywords.length > 0) {
      content += `Research Areas: ${matchedKeywords.slice(0, 5).join(', ')}\n\n`;
    }

    // 著者情報
    if (item.author) {
      content += `Authors: ${item.author}\n\n`;
    }

    // カテゴリ
    const categories = this.extractCategories(item);
    if (categories.length > 0) {
      content += `Categories: ${categories.join(', ')}\n\n`;
    }

    // 要約またはコンテンツスニペット
    if (item.contentSnippet) {
      content += `Summary:\n${item.contentSnippet}\n\n`;
    } else if (item.summary) {
      content += `Summary:\n${item.summary}\n\n`;
    }

    // フルコンテンツ（HTMLタグを除去）
    if (item.content) {
      const cleanContent = this.sanitizeText(item.content);
      content += `Details:\n${cleanContent}\n\n`;
    }

    // DeepMind研究の重要性を追加
    content += '\nAbout DeepMind:\n';
    content += 'DeepMind is a world leader in artificial intelligence research, ';
    content += 'known for breakthroughs in reinforcement learning, protein folding (AlphaFold), ';
    content += 'and large language models. Their research advances the state of AI ';
    content += 'while maintaining a focus on beneficial and safe AI development.\n';

    // リンク
    content += `\nRead the full article: ${item.link}`;

    return content;
  }

  /**
   * サムネイルの抽出
   */
  private extractItemThumbnail(item: any): string | undefined {
    // media:thumbnail
    if (item['media:thumbnail'] && item['media:thumbnail'].$ && item['media:thumbnail'].$.url) {
      return this.normalizeImageUrl(item['media:thumbnail'].$.url);
    }

    // media:content
    if (item['media:content'] && item['media:content'].$ && item['media:content'].$.url) {
      const mediaUrl = item['media:content'].$.url;
      if (this.isImageUrl(mediaUrl)) {
        return this.normalizeImageUrl(mediaUrl);
      }
    }

    // コンテンツからの抽出
    if (item.content) {
      return this.extractThumbnailFromContent(item.content);
    }

    // サムネイルが見つからない場合はundefinedを返す
    return undefined;
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

    // DeepMind画像URL
    const deepmindImageMatch = content.match(/https:\/\/deepmind\.google[^"'\s]+(\.jpg|\.png|\.webp|\.svg)/i);
    if (deepmindImageMatch) {
      return deepmindImageMatch[0];
    }

    return undefined;
  }

  /**
   * URLが画像かどうかチェック
   */
  private isImageUrl(url: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
    const lowerUrl = url.toLowerCase();
    return imageExtensions.some(ext => lowerUrl.endsWith(ext));
  }

  /**
   * 画像URLの正規化
   */
  private normalizeImageUrl(url: string): string {
    // 相対URLを絶対URLに変換
    if (url.startsWith('/')) {
      return `https://deepmind.google${url}`;
    }

    // プロトコルなしのURL
    if (url.startsWith('//')) {
      return `https:${url}`;
    }

    // deepmind.comからdeepmind.googleへのリダイレクト対応
    // セキュリティ: URLをパースしてホストを検証
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname === 'deepmind.com' || parsedUrl.hostname === 'www.deepmind.com') {
        parsedUrl.hostname = parsedUrl.hostname.replace('deepmind.com', 'deepmind.google');
        return parsedUrl.href;
      }
    } catch {
      // URLパースに失敗した場合はそのまま返す
    }

    return url;
  }
}
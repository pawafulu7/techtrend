import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { BaseFetcher } from '../base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import { parseRSSDate } from '@/lib/utils/date';
import logger from '@/lib/logger';
import { HuggingFacePapersEnricher } from '@/lib/enrichers/huggingface-papers';

export class HuggingFacePapersFetcher extends BaseFetcher {
  private parser: Parser;
  private enricher: HuggingFacePapersEnricher;

  constructor(source: Source) {
    super(source);
    this.parser = new Parser();
    this.enricher = new HuggingFacePapersEnricher();
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    // 7日前を基準日とする（論文は最新のものだけ）
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    try {
      logger.info(`Hugging Face Daily Papers記事取得開始`);

      const feed = await this.retry(() =>
        this.parser.parseURL('https://rsshub.app/huggingface/daily-papers')
      );

      if (!feed.items || feed.items.length === 0) {
        logger.warn('Hugging Face Daily Papers: 記事が見つかりませんでした');
        return { articles, errors };
      }

      // 最大30件まで取得
      const maxArticles = 30;
      let processedCount = 0;

      for (const item of feed.items) {
        if (processedCount >= maxArticles) break;

        if (!item.title || !item.link) {
          continue;
        }

        const publishedAt = item.pubDate ?
          parseRSSDate(item.pubDate) : new Date();

        // 7日以内の記事のみ
        if (publishedAt < sevenDaysAgo) {
          continue;
        }

        // Hugging Face固有の処理
        const author = this.extractAuthor(item);
        const tags = this.extractTags(item);

        // Webページから論文の詳細を取得
        let fullContent: string | null = null;
        let thumbnail: string | undefined = this.extractThumbnailFromItem(item);

        try {
          const enrichedData = await this.enricher.enrich(item.link);
          if (enrichedData) {
            fullContent = enrichedData.content;
            if (enrichedData.thumbnail) {
              thumbnail = enrichedData.thumbnail;
            }
          }
        } catch (_error) {
          logger.warn(`Hugging Face Papers: エンリッチメント失敗 ${item.link}`);
        }

        // フルコンテンツが取得できなかった場合はRSSコンテンツを使用
        const content = fullContent || this.generateEnrichedContent(item, author, tags);

        // エンリッチメント処理
        const enrichedArticle = this.enrichArticle({
          title: this.cleanTitle(item.title),
          url: item.link,
          content, // Webから取得したフルコンテンツ
          summary: undefined, // 必須: 要約は生成しない
          publishedAt,
          sourceId: this.source.id,
          thumbnail,
        }, author, tags);

        articles.push(enrichedArticle);
        processedCount++;
      }

      logger.info(`Hugging Face Daily Papers: ${processedCount}件の記事を取得`);

    } catch (error) {
      const errorMessage = `Hugging Face Daily Papers取得エラー: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMessage);
      errors.push(new Error(errorMessage));
    }

    return { articles, errors };
  }

  private cleanTitle(title: string): string {
    // 論文タイトルから不要な文字を削除
    return title
      .replace(/\[.*?\]/g, '') // [arxiv:2401.12345]などを削除
      .replace(/^\s*Paper:\s*/i, '') // "Paper: "プレフィックスを削除
      .trim();
  }

  private extractAuthor(item: unknown): string | undefined {
    // Type-safe author extraction
    if (typeof item === 'object' && item !== null) {
      const itemAny = item as any;
      if (itemAny.creator) {
        return itemAny.creator;
      }
      if (itemAny['dc:creator']) {
        return itemAny['dc:creator'];
      }
    }
    return undefined;
  }

  private extractTags(item: unknown): string[] {
    const tags: string[] = [];

    // Type-safe tag extraction
    if (typeof item === 'object' && item !== null) {
      const itemAny = item as any;
      if (itemAny.categories && Array.isArray(itemAny.categories)) {
        tags.push(...itemAny.categories);
      }
    }

    return [...new Set(tags)];
  }

  private extractThumbnailFromItem(item: unknown): string | undefined {
    if (typeof item !== 'object' || item === null) return undefined;

    const itemAny = item as any;

    // RSSのenclosureからサムネイルを抽出
    if (itemAny.enclosure && itemAny.enclosure.url) {
      return itemAny.enclosure.url;
    }

    // content内からimgタグを探す
    if (itemAny.content) {
      const imgMatch = itemAny.content.match(/<img[^>]+src="([^"]+)"/);
      if (imgMatch && imgMatch[1]) {
        return imgMatch[1];
      }
    }

    return undefined;
  }

  private enrichArticle(
    article: CreateArticleInput,
    author?: string,
    tags?: string[]
  ): CreateArticleInput {
    // AI/論文関連のキーワードを検出してタグを追加
    const aiKeywords = [
      'GPT', 'LLM', 'Transformer', 'BERT', 'Neural', 'Deep Learning',
      'Machine Learning', 'NLP', 'Computer Vision', 'Reinforcement Learning',
      'Diffusion', 'GAN', 'VAE', 'CLIP', 'ViT', 'Attention', 'Fine-tuning',
      'Prompt', 'Embedding', 'Token', 'Pre-train', 'Zero-shot', 'Few-shot',
      'Multi-modal', 'Language Model', 'Vision Transformer'
    ];

    const detectedKeywords: string[] = [];
    const titleLower = article.title.toLowerCase();

    for (const keyword of aiKeywords) {
      if (titleLower.includes(keyword.toLowerCase())) {
        detectedKeywords.push(keyword);
      }
    }

    // メタデータとして論文情報を追加
    const enrichedArticle: CreateArticleInput = {
      ...article,
      metadata: {
        source: 'Hugging Face Daily Papers',
        type: 'research_paper',
        author: author,
        keywords: detectedKeywords,
        tags: ['AI Research', 'Papers', ...(tags || [])],  // 'Hugging Face'は削除（ソース情報）
        fetchedAt: new Date().toISOString(),
      }
    };

    return enrichedArticle;
  }

  private generateEnrichedContent(item: unknown, author?: string, tags?: string[]): string {
    if (typeof item !== 'object' || item === null) return '';

    const itemAny = item as any;

    // 基本コンテンツ
    const content = itemAny.content || itemAny.contentSnippet || '';

    // メタ情報を追加して要約生成時により良い情報を提供
    const enrichedParts: string[] = [];

    // タイトル
    enrichedParts.push(`Title: ${itemAny.title || 'Untitled'}`);
    enrichedParts.push('Source: Hugging Face Daily Papers');

    // 著者情報
    if (author) {
      enrichedParts.push(`Author: ${author}`);
    }

    // リンク
    if (itemAny.link) {
      // arXiv IDを抽出
      const arxivMatch = itemAny.link.match(/arxiv\.org\/abs\/(\d+\.\d+)/);
      if (arxivMatch) {
        enrichedParts.push(`arXiv ID: ${arxivMatch[1]}`);
      }
    }

    // タグ情報
    if (tags && tags.length > 0) {
      enrichedParts.push(`Tags: ${tags.join(', ')}`);
    }

    // カテゴリ情報
    if (itemAny.categories && Array.isArray(itemAny.categories) && itemAny.categories.length > 0) {
      enrichedParts.push(`Categories: ${itemAny.categories.join(', ')}`);
    }

    // 本文
    enrichedParts.push('');
    enrichedParts.push('Abstract/Content:');
    enrichedParts.push(content);

    return enrichedParts.join('\n');
  }
}
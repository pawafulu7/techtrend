import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { BaseFetcher } from '../base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import { parseRSSDate } from '@/lib/utils/date';
import logger from '@/lib/logger';

export class HuggingFacePapersFetcher extends BaseFetcher {
  private parser: Parser;

  constructor(source: Source) {
    super(source);
    this.parser = new Parser();
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

        // エンリッチメント処理
        const enrichedArticle = this.enrichArticle({
          title: this.cleanTitle(item.title),
          url: item.link,
          summary: undefined, // 必須: 要約は生成しない
          publishedAt,
          sourceId: this.source.id,
          thumbnail: this.extractThumbnailFromItem(item),
        });

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

  private extractThumbnailFromItem(item: any): string | undefined {
    // RSS内の画像URLを抽出（存在する場合）
    if (item.enclosure && item.enclosure.url) {
      return item.enclosure.url;
    }

    // content内からimgタグを探す
    if (item.content) {
      const imgMatch = item.content.match(/<img[^>]+src="([^"]+)"/);
      if (imgMatch && imgMatch[1]) {
        return imgMatch[1];
      }
    }

    return undefined;
  }

  private enrichArticle(article: CreateArticleInput): CreateArticleInput {
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
        keywords: detectedKeywords,
        fetchedAt: new Date().toISOString(),
      }
    };

    return enrichedArticle;
  }

  private generateEnrichedContent(item: any): string {
    // 基本コンテンツ
    let content = item.content || item.contentSnippet || '';

    // メタ情報を追加して要約生成時により良い情報を提供
    const enrichedParts: string[] = [];

    // タイトル
    enrichedParts.push(`Title: ${item.title}`);
    enrichedParts.push('Source: Hugging Face Daily Papers');

    // リンク
    if (item.link) {
      // arXiv IDを抽出
      const arxivMatch = item.link.match(/arxiv\.org\/abs\/(\d+\.\d+)/);
      if (arxivMatch) {
        enrichedParts.push(`arXiv ID: ${arxivMatch[1]}`);
      }
    }

    // カテゴリ情報
    if (item.categories && Array.isArray(item.categories) && item.categories.length > 0) {
      enrichedParts.push(`Categories: ${item.categories.join(', ')}`);
    }

    // 本文
    enrichedParts.push('');  // 空行
    enrichedParts.push('Abstract/Content:');
    enrichedParts.push(content);

    return enrichedParts.join('\n');
  }
}
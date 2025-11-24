import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import sanitizeHtml from 'sanitize-html';
import { BaseFetcher } from '../base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import { parseRSSDate } from '@/lib/utils/date';
import logger from '@/lib/logger';
import { ArxivAIEnricher } from '@/lib/enrichers/arxiv-ai';

interface ArxivCategory {
  name: string;
  url: string;
  maxArticles: number;
}

export class ArxivAIFetcher extends BaseFetcher {
  private parser: Parser;
  private enricher: ArxivAIEnricher;
  private categories: ArxivCategory[] = [
    {
      name: 'AI',
      url: 'https://rss.arxiv.org/rss/cs.AI',
      maxArticles: 10
    },
    {
      name: 'Machine Learning',
      url: 'https://rss.arxiv.org/rss/cs.LG',
      maxArticles: 10
    },
    {
      name: 'NLP',
      url: 'https://rss.arxiv.org/rss/cs.CL',
      maxArticles: 10
    }
  ];

  constructor(source: Source) {
    super(source);
    this.parser = new Parser({
      timeout: Number(process.env.FETCHER_TIMEOUT_MS ?? 120_000),
    });
    this.enricher = new ArxivAIEnricher();
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];
    const processedUrls = new Set<string>(); // 重複除去用

    // 30日前を基準日とする（論文は最新のものだけ）
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const category of this.categories) {
      try {
        logger.info(`arXiv ${category.name}記事取得開始`);

        const feed = await this.retry(() =>
          this.parser.parseURL(category.url)
        );

        if (!feed.items || feed.items.length === 0) {
          logger.warn(`arXiv ${category.name}: 記事が見つかりませんでした`);
          continue;
        }

        let categoryArticleCount = 0;

        for (const item of feed.items) {
          if (categoryArticleCount >= category.maxArticles) break;

          if (!item.title || !item.link) {
            continue;
          }

          // 重複チェック（複数カテゴリに属する論文があるため）
          if (processedUrls.has(item.link)) {
            continue;
          }

          const publishedAt = item.pubDate ?
            parseRSSDate(item.pubDate) : new Date();

          // 30日以内の記事のみ
          if (publishedAt < thirtyDaysAgo) {
            continue;
          }

          // arXiv固有の処理
          const cleanedTitle = this.cleanArxivTitle(item.title);
          const arxivId = this.extractArxivId(item.link);
          const abstract = this.extractAbstract(item);

          // Webページから論文のアブストラクト全文を取得
          let fullContent: string | null = null;
          let thumbnail: string | undefined = undefined;

          try {
            const enrichedData = await this.enricher.enrich(item.link);
            if (enrichedData) {
              fullContent = enrichedData.content;
              if (enrichedData.thumbnail) {
                thumbnail = enrichedData.thumbnail;
              }
            }
          } catch (_error) {
            logger.warn(`arXiv ${category.name}: エンリッチメント失敗 ${item.link}`);
          }

          // フルコンテンツが取得できなかった場合はRSSコンテンツを使用
          const content = fullContent || this.generateEnrichedContent(item, category.name, arxivId, abstract);

          // エンリッチメント処理
          const enrichedArticle = this.enrichArticle({
            title: cleanedTitle,
            url: item.link,
            content, // Webから取得したフルコンテンツ
            summary: undefined, // 必須: 要約は生成しない
            publishedAt,
            sourceId: this.source.id,
            thumbnail, // arXivには画像がない場合が多い
          }, category.name, arxivId, abstract);

          articles.push(enrichedArticle);
          processedUrls.add(item.link);
          categoryArticleCount++;
        }

        logger.info(`arXiv ${category.name}: ${categoryArticleCount}件の記事を取得`);

      } catch (error) {
        const errorMessage = `arXiv ${category.name}取得エラー: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMessage);
        errors.push(new Error(errorMessage));
      }
    }

    logger.info(`arXiv全体: ${articles.length}件の記事を取得`);

    return { articles, errors };
  }

  private cleanArxivTitle(title: string): string {
    // arXivタイトルから余計な情報を削除
    return title
      .replace(/\. \(arXiv:.*?\)/g, '') // arXiv IDを削除
      .replace(/^\s*\[.*?\]\s*/g, '') // カテゴリタグを削除
      .replace(/\s+/g, ' ') // 余分な空白を削除
      .trim();
  }

  private extractArxivId(url: string): string | undefined {
    // URLからarXiv IDを抽出
    const match = url.match(/arxiv\.org\/abs\/(\d+\.\d+)/);
    return match ? match[1] : undefined;
  }

  private extractAbstract(item: unknown): string | undefined {
    if (typeof item !== 'object' || item === null) return undefined;

    const itemAny = item as any;

    // descriptionまたはcontentからアブストラクトを抽出
    const content = itemAny.description || itemAny.content || '';

    // HTMLタグを削除（sanitize-htmlを使用）
    const cleanContent = sanitizeHtml(content, {
      allowedTags: [],
      allowedAttributes: {}
    });

    // arXivのアブストラクトは長いので最初の500文字に制限
    return cleanContent.length > 500
      ? cleanContent.substring(0, 497) + '...'
      : cleanContent;
  }

  private enrichArticle(
    article: CreateArticleInput,
    category: string,
    arxivId?: string,
    abstract?: string
  ): CreateArticleInput {
    // AI/ML/NLP関連のキーワードを検出
    const aiKeywords = this.detectKeywords(article.title, abstract);

    // カテゴリ別のタグ付け
    const categoryTags: Record<string, string[]> = {
      'AI': ['Artificial Intelligence', 'AI Research', 'arXiv'],
      'Machine Learning': ['Machine Learning', 'ML Research', 'arXiv'],
      'NLP': ['Natural Language Processing', 'NLP Research', 'arXiv']
    };

    // メタデータとして論文情報を追加
    const enrichedArticle: CreateArticleInput = {
      ...article,
      metadata: {
        source: 'arXiv',
        category: category,
        arxivId: arxivId,
        abstract: abstract,
        type: 'research_paper',
        keywords: aiKeywords,
        tags: categoryTags[category] || [],
        fetchedAt: new Date().toISOString(),
      }
    };

    return enrichedArticle;
  }

  private detectKeywords(title: string, abstract?: string): string[] {
    const text = `${title} ${abstract || ''}`.toLowerCase();

    const keywordGroups = {
      'Transformer': ['transformer', 'attention', 'self-attention'],
      'LLM': ['llm', 'large language model', 'language model'],
      'GPT': ['gpt', 'generative pre-train'],
      'BERT': ['bert', 'bidirectional encoder'],
      'Diffusion': ['diffusion', 'ddpm', 'ddim'],
      'GAN': ['gan', 'generative adversarial'],
      'VAE': ['vae', 'variational autoencoder'],
      'Vision': ['vision', 'visual', 'image', 'cv'],
      'Reinforcement Learning': ['reinforcement', 'rl', 'policy gradient'],
      'Fine-tuning': ['fine-tun', 'finetun', 'adaptation'],
      'Prompt': ['prompt', 'in-context', 'few-shot', 'zero-shot'],
      'Multi-modal': ['multi-modal', 'multimodal', 'cross-modal'],
      'Embedding': ['embedding', 'representation', 'encode'],
      'Neural Network': ['neural', 'deep learning', 'convolution'],
      'Optimization': ['optimi', 'gradient', 'loss function'],
      'Benchmark': ['benchmark', 'evaluation', 'dataset', 'sota']
    };

    const detectedKeywords = new Set<string>();

    for (const [keyword, patterns] of Object.entries(keywordGroups)) {
      for (const pattern of patterns) {
        if (text.includes(pattern)) {
          detectedKeywords.add(keyword);
          break;
        }
      }
    }

    return Array.from(detectedKeywords);
  }

  private generateEnrichedContent(item: unknown, categoryName: string, arxivId?: string, abstract?: string): string {
    if (typeof item !== 'object' || item === null) return '';

    const itemAny = item as any;

    // メタ情報を追加して要約生成時により良い情報を提供
    const enrichedParts: string[] = [];

    // タイトル
    enrichedParts.push(`Title: ${itemAny.title || 'Untitled'}`);
    enrichedParts.push(`Category: ${categoryName}`);
    enrichedParts.push('Source: arXiv');

    // arXiv ID
    if (arxivId) {
      enrichedParts.push(`arXiv ID: ${arxivId}`);
    }

    // 著者情報
    if (itemAny.author) {
      enrichedParts.push(`Authors: ${itemAny.author}`);
    }

    // カテゴリ情報
    if (itemAny.categories && Array.isArray(itemAny.categories) && itemAny.categories.length > 0) {
      enrichedParts.push(`Subject Areas: ${itemAny.categories.join(', ')}`);
    }

    // アブストラクト
    enrichedParts.push('');
    enrichedParts.push('Abstract:');
    enrichedParts.push(abstract || itemAny.content || itemAny.contentSnippet || '');

    // 本文（追加情報があれば）
    if (itemAny.content && itemAny.content !== abstract) {
      enrichedParts.push('');
      enrichedParts.push('Additional Content:');
      enrichedParts.push(itemAny.content);
    }

    return enrichedParts.join('\n');
  }
}

import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { BaseFetcher } from '../base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import { parseRSSDate } from '@/lib/utils/date';
import logger from '@/lib/logger';
import axios from 'axios';
import { QiitaAIEnricher } from '@/lib/enrichers/qiita-ai';

interface QiitaTag {
  name: string;
  url: string;
  maxArticles: number;
  minLikes: number;
}

interface QiitaApiItem {
  id: string;
  title: string;
  url: string;
  likes_count: number;
  created_at: string;
  user: {
    id: string;
    name: string;
    profile_image_url: string;
  };
  tags: Array<{
    name: string;
  }>;
  rendered_body?: string;
}

export class QiitaAIFetcher extends BaseFetcher {
  private parser: Parser;
  private lastApiCall = 0;
  private readonly API_RATE_LIMIT_MS = 1000; // 1秒に1回の制限
  private enricher: QiitaAIEnricher;
  private tags: QiitaTag[] = [
    {
      name: 'LLM',
      url: 'https://qiita.com/tags/llm/feed',
      maxArticles: 5,
      minLikes: 3
    },
    {
      name: 'ChatGPT',
      url: 'https://qiita.com/tags/chatgpt/feed',
      maxArticles: 5,
      minLikes: 3
    },
    {
      name: 'LangChain',
      url: 'https://qiita.com/tags/langchain/feed',
      maxArticles: 5,
      minLikes: 3
    },
    {
      name: '機械学習',
      url: 'https://qiita.com/tags/%E6%A9%9F%E6%A2%B0%E5%AD%A6%E7%BF%92/feed',
      maxArticles: 5,
      minLikes: 3
    }
  ];

  constructor(source: Source) {
    super(source);
    this.parser = new Parser();
    this.enricher = new QiitaAIEnricher();
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];
    const processedUrls = new Set<string>(); // 重複除去用

    // 30日前を基準日とする
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const tag of this.tags) {
      try {
        logger.info(`Qiita ${tag.name}タグ記事取得開始`);

        const feed = await this.retry(() =>
          this.parser.parseURL(tag.url)
        );

        if (!feed.items || feed.items.length === 0) {
          logger.warn(`Qiita ${tag.name}: 記事が見つかりませんでした`);
          continue;
        }

        let tagArticleCount = 0;

        for (const item of feed.items) {
          if (tagArticleCount >= tag.maxArticles) break;

          if (!item.title || !item.link) {
            continue;
          }

          // URLを正規化してから重複チェック（複数タグに属する記事があるため）
          const normalizedUrl = this.normalizeUrl(item.link);
          if (processedUrls.has(normalizedUrl)) {
            continue;
          }

          // 日付のフォールバック処理（isoDate -> pubDate -> 現在日時）
          const publishedAt = item.isoDate ?
            new Date(item.isoDate) :
            (item.pubDate ? parseRSSDate(item.pubDate) : new Date());

          // 30日以内の記事のみ
          if (publishedAt < thirtyDaysAgo) {
            continue;
          }

          // Qiita固有の処理
          const author = this.extractAuthor(item);
          const tags = this.extractTags(item);
          const likesCount = await this.fetchLikesCount(item.link);

          // いいね数でフィルタリング
          if (likesCount < tag.minLikes) {
            logger.debug(`Qiita ${tag.name}: ${item.title} のいいね数（${likesCount}）が基準未満`);
            continue;
          }

          // Webページから本文を取得
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
            logger.warn(`Qiita ${tag.name}: エンリッチメント失敗 ${item.link}`);
          }

          // フルコンテンツが取得できなかった場合はRSSコンテンツを使用
          const content = fullContent || this.generateEnrichedContent(item, tag.name, author, tags, likesCount);

          // エンリッチメント処理
          const enrichedArticle = this.enrichArticle({
            title: item.title,
            url: normalizedUrl,
            content, // Webから取得したフルコンテンツ
            summary: undefined, // 必須: 要約は生成しない
            publishedAt,
            sourceId: this.source.id,
            thumbnail,
          }, tag.name, author, tags, likesCount);

          articles.push(enrichedArticle);
          processedUrls.add(normalizedUrl);
          tagArticleCount++;
        }

        logger.info(`Qiita ${tag.name}: ${tagArticleCount}件の記事を取得`);

      } catch (error) {
        const errorMessage = `Qiita ${tag.name}取得エラー: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMessage);
        errors.push(new Error(errorMessage));
      }
    }

    logger.info(`Qiita AI全体: ${articles.length}件の記事を取得`);

    return { articles, errors };
  }

  private extractAuthor(item: unknown): string | undefined {
    if (typeof item !== 'object' || item === null) return undefined;

    const itemAny = item as any;

    // Qiitaの著者情報を抽出
    if (itemAny.creator) {
      return itemAny.creator;
    }
    if (itemAny['dc:creator']) {
      return itemAny['dc:creator'];
    }
    return undefined;
  }

  private extractTags(item: unknown): string[] {
    if (typeof item !== 'object' || item === null) return [];

    const itemAny = item as any;
    const tags: string[] = [];

    // カテゴリからタグを抽出
    if (itemAny.categories && Array.isArray(itemAny.categories)) {
      tags.push(...itemAny.categories);
    }

    // Qiitaのタグ形式を抽出
    if (itemAny.content) {
      // Qiitaタグ形式: タグ名を抽出（全角コロンにも対応）
      const tagMatches = itemAny.content.match(/タグ[:：]\s*([^<\n]+)/);
      if (tagMatches && tagMatches[1]) {
        const tagList = tagMatches[1].split(/[,、\s]+/).map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        tags.push(...tagList);
      }
    }

    return [...new Set(tags)];
  }

  private extractThumbnailFromItem(item: unknown): string | undefined {
    if (typeof item !== 'object' || item === null) {
      // Qiitaのデフォルトサムネイル
      return 'https://cdn.qiita.com/assets/qiita-fb-2887e7b4aad86fd8c25cea84846f2236.png';
    }

    const itemAny = item as any;

    // OGP画像を抽出
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

    // Qiitaのデフォルトサムネイル
    return 'https://cdn.qiita.com/assets/qiita-fb-2887e7b4aad86fd8c25cea84846f2236.png';
  }

  private async fetchLikesCount(url: string): Promise<number> {
    try {
      // URLから記事IDを抽出
      const match = url.match(/qiita\.com\/[^\/]+\/items\/([a-z0-9]+)/);
      if (!match) return 0;

      const itemId = match[1];

      // レート制限の確認
      const now = Date.now();
      const timeSinceLastCall = now - this.lastApiCall;
      if (timeSinceLastCall < this.API_RATE_LIMIT_MS) {
        await new Promise(resolve => setTimeout(resolve, this.API_RATE_LIMIT_MS - timeSinceLastCall));
      }
      this.lastApiCall = Date.now();

      // Qiita APIから記事情報を取得（いいね数を含む）
      const response = await axios.get<QiitaApiItem>(
        `https://qiita.com/api/v2/items/${itemId}`,
        {
          timeout: 5000,
          headers: {
            'Accept': 'application/json',
            // 環境変数からトークンを取得（オプション）
            ...(process.env.QIITA_API_TOKEN && { 'Authorization': `Bearer ${process.env.QIITA_API_TOKEN}` })
          }
        }
      );

      return response.data.likes_count || 0;

    } catch (error) {
      // API取得に失敗した場合はデフォルト値を返す
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        // レート制限に達した場合
        logger.warn('Qiita API rate limit reached');
      } else {
        logger.debug(`Qiitaいいね数取得エラー: ${error instanceof Error ? error.message : String(error)}`);
      }
      return 0;
    }
  }

  private enrichArticle(
    article: CreateArticleInput,
    tagName: string,
    author?: string,
    tags?: string[],
    likesCount?: number
  ): CreateArticleInput {
    // AI/LLM関連のキーワードを検出
    const aiKeywords = this.detectAIKeywords(article.title, tags);

    // タグ別のメタタグ付け
    const tagMetaTags: Record<string, string[]> = {
      'LLM': ['LLM', '大規模言語モデル', 'AI実装', 'Qiita'],
      'ChatGPT': ['ChatGPT', 'OpenAI', 'GPT', 'AIアプリ', 'Qiita'],
      'LangChain': ['LangChain', 'LLM開発', 'RAG', 'AI開発', 'Qiita'],
      '機械学習': ['機械学習', 'ML', 'データサイエンス', 'Python', 'Qiita']
    };

    // 人気度によるスコアリング
    const popularityScore = this.calculatePopularityScore(likesCount || 0);

    // メタデータとして記事情報を追加
    const enrichedArticle: CreateArticleInput = {
      ...article,
      metadata: {
        source: 'Qiita',
        platform: 'Qiita AI Tags',
        tag: tagName,
        author: author,
        type: 'technical_article',
        language: 'ja',
        keywords: aiKeywords,
        tags: [...(tagMetaTags[tagName] || []), ...(tags || [])],
        likesCount: likesCount,
        popularityScore: popularityScore,
        quality: this.assessQuality(likesCount || 0, tags || []),
        fetchedAt: new Date().toISOString(),
      }
    };

    return enrichedArticle;
  }

  private detectAIKeywords(title: string, tags?: string[]): string[] {
    const text = `${title} ${(tags || []).join(' ')}`.toLowerCase();

    const keywordPatterns = {
      'GPT': ['gpt', 'chatgpt', 'openai'],
      'Claude': ['claude', 'anthropic'],
      'Gemini': ['gemini', 'bard', 'google ai'],
      'Copilot': ['copilot', 'github copilot', 'code assistant'],
      'LLM': ['llm', '大規模言語モデル', 'large language'],
      'RAG': ['rag', 'retrieval', '検索拡張生成'],
      'Fine-tuning': ['fine-tun', 'ファインチューニング', 'peft', 'lora'],
      'Prompt Engineering': ['prompt', 'プロンプト', 'few-shot', 'zero-shot'],
      'LangChain': ['langchain', 'ラングチェーン'],
      'LlamaIndex': ['llamaindex', 'llama-index', 'gpt-index'],
      'Vector DB': ['vector', 'ベクトル', 'embedding', 'pinecone', 'weaviate'],
      'Hugging Face': ['hugging face', 'transformers', 'diffusers'],
      'Stable Diffusion': ['stable diffusion', 'sdxl', '画像生成'],
      'AI Agent': ['agent', 'エージェント', 'autonomous', 'autogen'],
      'Function Calling': ['function call', 'tool', 'ツール使用'],
      'Streaming': ['stream', 'ストリーミング', 'server-sent'],
      'Token Optimization': ['token', 'トークン', 'context window'],
      'AI Safety': ['alignment', 'hallucination', 'ハルシネーション'],
      'MLOps': ['mlops', 'ml ops', 'モデル運用']
    };

    const detectedKeywords = new Set<string>();

    for (const [keyword, patterns] of Object.entries(keywordPatterns)) {
      for (const pattern of patterns) {
        if (text.includes(pattern)) {
          detectedKeywords.add(keyword);
          break;
        }
      }
    }

    return Array.from(detectedKeywords);
  }

  private calculatePopularityScore(likesCount: number): number {
    // いいね数から人気度スコアを計算（0-100）
    if (likesCount >= 100) return 100;
    if (likesCount >= 50) return 90;
    if (likesCount >= 30) return 80;
    if (likesCount >= 20) return 75;
    if (likesCount >= 10) return 70;
    if (likesCount >= 5) return 65;
    if (likesCount >= 3) return 60;
    return 50;
  }

  private assessQuality(likesCount: number, tags: string[]): 'high' | 'medium' | 'low' {
    // 記事の品質を評価
    if (likesCount >= 50 && tags.length >= 3) return 'high';
    if (likesCount >= 20 && tags.length >= 2) return 'high';
    if (likesCount >= 10 || tags.length >= 2) return 'medium';
    if (likesCount >= 3) return 'medium';
    return 'low';
  }

  /**
   * URLを正規化（クエリパラメータ除去、HTTPSへ統一）
   * @override
   */
  protected normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // HTTPをHTTPSに統一
      if (urlObj.protocol === 'http:') {
        urlObj.protocol = 'https:';
      }
      // クエリパラメータを除去（重複検出のため）
      urlObj.search = '';
      // フラグメントも除去
      urlObj.hash = '';
      return urlObj.toString();
    } catch (_error) {
      // URL解析に失敗した場合は元のURLを返す
      return url;
    }
  }

  private generateEnrichedContent(item: unknown, tagName: string, author?: string, tags?: string[], likesCount?: number): string {
    if (typeof item !== 'object' || item === null) return '';

    const itemAny = item as any;

    // 基本コンテンツ
    const content = itemAny.content || itemAny.contentSnippet || '';

    // メタ情報を追加して要約生成時により良い情報を提供
    const enrichedParts: string[] = [];

    // タイトルと基本情報
    enrichedParts.push(`タイトル: ${itemAny.title || 'Untitled'}`);
    enrichedParts.push(`タグ: ${tagName}`);

    // 著者情報
    if (author) {
      enrichedParts.push(`著者: ${author}`);
    }

    // タグ情報
    if (tags && tags.length > 0) {
      enrichedParts.push(`関連タグ: ${tags.join(', ')}`);
    }

    // いいね数
    if (likesCount !== undefined) {
      enrichedParts.push(`いいね数: ${likesCount}`);
    }

    // カテゴリ情報
    if (itemAny.categories && Array.isArray(itemAny.categories) && itemAny.categories.length > 0) {
      enrichedParts.push(`カテゴリ: ${itemAny.categories.join(', ')}`);
    }

    // 本文
    enrichedParts.push('');
    enrichedParts.push('本文:');
    enrichedParts.push(content);

    return enrichedParts.join('\n');
  }
}
import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { BaseFetcher } from '../base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import { parseRSSDate } from '@/lib/utils/date';
import logger from '@/lib/logger';
import axios from 'axios';

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
  private tags: QiitaTag[] = [
    {
      name: 'LLM',
      url: 'https://qiita.com/tags/llm/feed',
      maxArticles: 5,
      minLikes: 10
    },
    {
      name: 'ChatGPT',
      url: 'https://qiita.com/tags/chatgpt/feed',
      maxArticles: 5,
      minLikes: 10
    },
    {
      name: 'LangChain',
      url: 'https://qiita.com/tags/langchain/feed',
      maxArticles: 5,
      minLikes: 10
    },
    {
      name: '機械学習',
      url: 'https://qiita.com/tags/%E6%A9%9F%E6%A2%B0%E5%AD%A6%E7%BF%92/feed',
      maxArticles: 5,
      minLikes: 10
    }
  ];

  constructor(source: Source) {
    super(source);
    this.parser = new Parser();
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

          // 重複チェック（複数タグに属する記事があるため）
          if (processedUrls.has(item.link)) {
            continue;
          }

          const publishedAt = item.pubDate ?
            parseRSSDate(item.pubDate) : new Date();

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

          // エンリッチメント処理
          const enrichedArticle = this.enrichArticle({
            title: item.title,
            url: item.link,
            summary: undefined, // 必須: 要約は生成しない
            publishedAt,
            sourceId: this.source.id,
            thumbnail: this.extractThumbnailFromItem(item),
          }, tag.name, author, tags, likesCount);

          articles.push(enrichedArticle);
          processedUrls.add(item.link);
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

  private extractAuthor(item: any): string | undefined {
    // Qiitaの著者情報を抽出
    if (item.creator) {
      return item.creator;
    }
    if (item['dc:creator']) {
      return item['dc:creator'];
    }
    return undefined;
  }

  private extractTags(item: any): string[] {
    const tags: string[] = [];

    // カテゴリからタグを抽出
    if (item.categories && Array.isArray(item.categories)) {
      tags.push(...item.categories);
    }

    // Qiitaのタグ形式を抽出
    if (item.content) {
      // Qiitaタグ形式: タグ名を抽出
      const tagMatches = item.content.match(/タグ:([^<\n]+)/);
      if (tagMatches && tagMatches[1]) {
        const tagList = tagMatches[1].split(/[,、]/).map(t => t.trim());
        tags.push(...tagList);
      }
    }

    return [...new Set(tags)]; // 重複を除去
  }

  private extractThumbnailFromItem(item: any): string | undefined {
    // OGP画像を抽出
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

    // QiitaのデフォルトOGP画像
    return 'https://cdn.qiita.com/assets/qiita-fb-2887e7b4aad86fd8c25cea84846f2236.png';
  }

  private async fetchLikesCount(url: string): Promise<number> {
    try {
      // URLから記事IDを抽出
      const match = url.match(/qiita\.com\/[^\/]+\/items\/([a-z0-9]+)/);
      if (!match) return 0;

      const itemId = match[1];

      // Qiita APIから記事情報を取得（いいね数を含む）
      // 注意: Qiita APIにはレート制限があるため、実際の実装では注意が必要
      const response = await axios.get<QiitaApiItem>(
        `https://qiita.com/api/v2/items/${itemId}`,
        {
          timeout: 5000,
          headers: {
            'Accept': 'application/json'
          }
        }
      );

      return response.data.likes_count || 0;

    } catch (error) {
      // API取得に失敗した場合はデフォルト値を返す
      logger.debug(`Qiitaいいね数取得エラー: ${error instanceof Error ? error.message : String(error)}`);
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
    if (likesCount >= 20) return 70;
    if (likesCount >= 10) return 60;
    return 50;
  }

  private assessQuality(likesCount: number, tags: string[]): 'high' | 'medium' | 'low' {
    // 記事の品質を評価
    if (likesCount >= 50 && tags.length >= 3) return 'high';
    if (likesCount >= 20 || tags.length >= 2) return 'medium';
    return 'low';
  }
}
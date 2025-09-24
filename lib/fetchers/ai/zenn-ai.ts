import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { BaseFetcher } from '../base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import { parseRSSDate } from '@/lib/utils/date';
import logger from '@/lib/logger';
import { ZennAIEnricher } from '@/lib/enrichers/zenn-ai';

interface ZennTopic {
  name: string;
  url: string;
  maxArticles: number;
}

export class ZennAIFetcher extends BaseFetcher {
  private parser: Parser;
  private enricher: ZennAIEnricher;
  private topics: ZennTopic[] = [
    {
      name: 'LLM',
      url: 'https://zenn.dev/topics/llm/feed',
      maxArticles: 5
    },
    {
      name: 'NLP',
      url: 'https://zenn.dev/topics/nlp/feed',
      maxArticles: 5
    },
    {
      name: 'ChatGPT',
      url: 'https://zenn.dev/topics/chatgpt/feed',
      maxArticles: 5
    },
    {
      name: 'LangChain',
      url: 'https://zenn.dev/topics/langchain/feed',
      maxArticles: 5
    },
    {
      name: '機械学習',
      url: 'https://zenn.dev/topics/%E6%A9%9F%E6%A2%B0%E5%AD%A6%E7%BF%92/feed',
      maxArticles: 5
    }
  ];

  constructor(source: Source) {
    super(source);
    this.parser = new Parser();
    this.enricher = new ZennAIEnricher();
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];
    const processedUrls = new Set<string>(); // 重複除去用

    // 30日前を基準日とする
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const topic of this.topics) {
      try {
        logger.info(`Zenn ${topic.name}トピック記事取得開始`);

        const feed = await this.retry(() =>
          this.parser.parseURL(topic.url)
        );

        if (!feed.items || feed.items.length === 0) {
          logger.warn(`Zenn ${topic.name}: 記事が見つかりませんでした`);
          continue;
        }

        let topicArticleCount = 0;

        for (const item of feed.items) {
          if (topicArticleCount >= topic.maxArticles) break;

          if (!item.title || !item.link) {
            continue;
          }

          // 重複チェック（複数トピックに属する記事があるため）
          if (processedUrls.has(item.link)) {
            continue;
          }

          const publishedAt = item.pubDate ?
            parseRSSDate(item.pubDate) : new Date();

          // 30日以内の記事のみ
          if (publishedAt < thirtyDaysAgo) {
            continue;
          }

          // Zenn固有の処理
          const author = this.extractAuthor(item);
          const tags = this.extractTags(item);

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
            logger.warn(`Zenn ${topic.name}: エンリッチメント失敗 ${item.link}`);
          }

          // フルコンテンツが取得できなかった場合はRSSコンテンツを使用
          const content = fullContent || this.generateEnrichedContent(item, topic.name, author, tags);

          // エンリッチメント処理
          const enrichedArticle = this.enrichArticle({
            title: item.title,
            url: item.link,
            content, // Webから取得したフルコンテンツ
            summary: undefined, // 必須: 要約は生成しない
            publishedAt,
            sourceId: this.source.id,
            thumbnail,
          }, topic.name, author, tags);

          articles.push(enrichedArticle);
          processedUrls.add(item.link);
          topicArticleCount++;
        }

        logger.info(`Zenn ${topic.name}: ${topicArticleCount}件の記事を取得`);

      } catch (error) {
        const errorMessage = `Zenn ${topic.name}取得エラー: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMessage);
        errors.push(new Error(errorMessage));
      }
    }

    logger.info(`Zenn AI全体: ${articles.length}件の記事を取得`);

    return { articles, errors };
  }

  private extractAuthor(item: any): string | undefined {
    // Zennの著者情報を抽出
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

    // contentからタグを抽出（Zennのタグ形式: #tag）
    if (item.content) {
      // Unicode属性を使用してより包括的なマッチング
      const tagMatches = item.content.match(/#[\p{L}\p{N}_]+/gu);
      if (tagMatches) {
        tags.push(...tagMatches.map(tag => tag.substring(1)));
      }
    }

    return [...new Set(tags)]; // 重複を除去
  }

  private extractThumbnailFromItem(item: any): string | undefined {
    // OGP画像を抽出（存在する場合）
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

    // Zennのデフォルトサムネイル構造から抽出
    if (item.link) {
      // Zenn記事URLから著者名と記事IDを抽出してOGP画像URLを構築
      const match = item.link.match(/zenn\.dev\/([^\/]+)\/articles\/([^\/\?]+)/);
      if (match) {
        // タイトルをサニタイゼーション（HTML/制御文字を除去）
        const sanitizedTitle = (item.title || 'Article')
          .replace(/<[^>]*>/g, '') // HTMLタグを除去
          .replace(/[<>'"]/g, '')   // 特殊文字を除去
          .replace(/[\n\r\t]/g, ' ') // 制御文字をスペースに置換
          .trim();
        return `https://res.cloudinary.com/zenn/image/upload/s--og-default--/co_rgb:222%2Cg_south_west%2Cl_text:notosansjp-medium.otf_37_bold:${match[1]}%2Cx_203%2Cy_98/c_fit%2Cco_rgb:222%2Cg_north_west%2Cl_text:notosansjp-medium.otf_70_bold:${encodeURIComponent(sanitizedTitle)}%2Cw_1010%2Cx_90%2Cy_100/bo_3px_solid_rgb:d6d6d6%2Cg_center%2Ch_630%2Cw_1200/v1627283836/default/og-bg-zenn.png`;
      }
    }

    return undefined;
  }

  private enrichArticle(
    article: CreateArticleInput,
    topicName: string,
    author?: string,
    tags?: string[]
  ): CreateArticleInput {
    // AI/LLM関連のキーワードを検出
    const aiKeywords = this.detectAIKeywords(article.title, tags);

    // トピック別のタグ付け
    const topicTags: Record<string, string[]> = {
      'LLM': ['LLM', '大規模言語モデル', 'AI実装'],
      'NLP': ['自然言語処理', 'NLP', 'テキスト処理'],
      'ChatGPT': ['ChatGPT', 'OpenAI', 'AIアプリ'],
      'LangChain': ['LangChain', 'AI開発', 'LLMフレームワーク'],
      '機械学習': ['機械学習', 'ML', 'データサイエンス']
    };

    // メタデータとして記事情報を追加
    const enrichedArticle: CreateArticleInput = {
      ...article,
      metadata: {
        source: 'Zenn',
        platform: 'Zenn AI Topics',
        topic: topicName,
        author: author,
        type: 'technical_article',
        language: 'ja',
        keywords: aiKeywords,
        tags: [...(topicTags[topicName] || []), ...(tags || [])],
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
      'LLM': ['llm', '大規模言語モデル', 'large language model'],
      'RAG': ['rag', 'retrieval', '検索拡張'],
      'Fine-tuning': ['fine-tun', 'ファインチューニング', '微調整'],
      'Prompt Engineering': ['prompt', 'プロンプト'],
      'LangChain': ['langchain', 'ラングチェーン'],
      'Vector DB': ['vector', 'ベクトル', 'embedding', '埋め込み'],
      'Transformer': ['transformer', 'attention', 'bert'],
      'Diffusion': ['diffusion', 'stable diffusion', '画像生成'],
      'AI Agent': ['agent', 'エージェント', 'autonomous'],
      'Function Calling': ['function call', 'tool use', 'ツール使用'],
      'Streaming': ['stream', 'ストリーミング', 'リアルタイム'],
      'Token': ['token', 'トークン', 'context'],
      'Hallucination': ['hallucination', 'ハルシネーション', '幻覚']
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

  private generateEnrichedContent(item: any, topicName: string, author?: string, tags?: string[]): string {
    // 基本コンテンツ
    const content = item.content || item.contentSnippet || '';

    // メタ情報を追加して要約生成時により良い情報を提供
    const enrichedParts: string[] = [];

    // タイトルと基本情報
    enrichedParts.push(`タイトル: ${item.title}`);
    enrichedParts.push(`トピック: ${topicName}`);

    // 著者情報
    if (author) {
      enrichedParts.push(`著者: ${author}`);
    }

    // タグ情報
    if (tags && tags.length > 0) {
      enrichedParts.push(`タグ: ${tags.join(', ')}`);
    }

    // カテゴリ情報
    if (item.categories && Array.isArray(item.categories) && item.categories.length > 0) {
      enrichedParts.push(`カテゴリ: ${item.categories.join(', ')}`);
    }

    // 本文
    enrichedParts.push('');  // 空行
    enrichedParts.push('本文:');
    enrichedParts.push(content);

    return enrichedParts.join('\n');
  }
}
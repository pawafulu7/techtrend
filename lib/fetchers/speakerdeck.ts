import { Source } from '@prisma/client';
import { BaseFetcher } from './base';
import RSSParser from 'rss-parser';
import type { CreateArticleInput } from '@/types/models';
import { speakerDeckConfig } from '@/lib/config/speakerdeck';
import * as cheerio from 'cheerio';

interface PresentationCandidate {
  url: string;
  title: string;
  author: string;
  views: number;
  category?: string;  // カテゴリー情報を追加（デバッグ・分析用）
}

interface PresentationDetails {
  publishedAt: Date;
  description?: string;
  thumbnail?: string;
}

export class SpeakerDeckFetcher extends BaseFetcher {
  private parser: RSSParser;
  
  constructor(source: Source) {
    super(source);
    this.parser = new RSSParser({
      customFields: {
        item: ['media:content', 'enclosure']
      }
    });
  }

  async fetch(): Promise<{ articles: CreateArticleInput[]; errors: Error[] }> {
    return this.safeFetch();
  }

  protected async fetchInternal(): Promise<{ articles: CreateArticleInput[]; errors: Error[] }> {
    const errors: Error[] = [];
    const articles: CreateArticleInput[] = [];

    // トレンドページから記事を取得（改善版）
    try {
      const trendingArticles = await this.fetchTrendingPresentations();
      articles.push(...trendingArticles);
    } catch (_error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);
    }

    // RSSフィードは設定で有効な場合のみ使用
    if (speakerDeckConfig.enableRSSFeeds) {
      const techSpeakers = [
        'twada', 'willnet', 'yosuke_furukawa', 'mizchi', 'makoga',
        'kenjiskywalker', 'matsumoto_r', 'kazuho', 'sorah', 'tagomoris',
        'kentaro', 'hsbt', 'kokukuma', 'tcnksm', 'kurotaky',
        'onk', 'voluntas', 'moznion', 'tokuhirom', 'gfx',
        'cho45', 'hakobe', 'yuki24', 'joker1007', 'k0kubun', 'azu',
      ];

      for (const speaker of techSpeakers) {
        try {
          const feedUrl = `https://speakerdeck.com/${speaker}.rss`;
          
          const feed = await this.parser.parseURL(feedUrl);
          
          for (const item of feed.items.slice(0, 3)) {
            if (!item.link || !item.title) continue;

            const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(item.title);
            if (!hasJapanese) continue;

            const article: CreateArticleInput = {
              title: item.title,
              url: item.link,
              sourceId: this.source.id,
              content: item.contentSnippet || item.content || '',
              publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
              author: speaker,
              tags: this.extractTags(item.title + ' ' + (item.contentSnippet || '')),
            };

            articles.push(article);
          }
        } catch (_error) {
          const err = error instanceof Error ? error : new Error(String(error));
          errors.push(err);
        }
      }
    }

    return { articles, errors };
  }

  /**
   * トレンドページから高品質なプレゼンテーションを取得
   * - Views数フィルタリング（1000以上）
   * - 日付フィルタリング（1年以内）
   * - 最大100件取得
   */
  private async fetchTrendingPresentations(): Promise<CreateArticleInput[]> {
    const articles: CreateArticleInput[] = [];
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    

    // Step 1: 一覧ページから候補を収集
    const candidates = await this.collectCandidates();

    if (!speakerDeckConfig.enableDetailFetch) {
      // 詳細取得を無効化している場合は、現在日付で記事を作成
      for (const candidate of candidates.slice(0, speakerDeckConfig.maxArticles)) {
        articles.push({
          title: candidate.title,
          url: candidate.url,
          sourceId: this.source.id,
          content: candidate.title,
          publishedAt: new Date(),
          author: candidate.author,
          tags: this.extractTags(candidate.title),
        });
      }
      return articles;
    }

    // Step 2: 個別ページから詳細情報を取得（並列処理）
    const chunks = this.chunkArray(candidates, speakerDeckConfig.parallelLimit);
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (candidate) => {
        try {
          const details = await this.fetchPresentationDetails(candidate.url);
          
          // 日付フィルタリング
          if (details.publishedAt >= oneYearAgo) {
            return {
              title: candidate.title,
              url: candidate.url,
              sourceId: this.source.id,
              content: details.description || candidate.title,
              publishedAt: details.publishedAt,
              author: candidate.author,
              tags: this.extractTags(candidate.title + ' ' + (details.description || '')),
              thumbnail: details.thumbnail,
            } as CreateArticleInput;
          }
          
          if (speakerDeckConfig.debug) {
          }
        } catch (_error) {
        }
        return null;
      });

      const results = await Promise.all(promises);
      const validArticles = results.filter((a: CreateArticleInput | null): a is CreateArticleInput => a !== null);
      articles.push(...validArticles);
      
      
      if (articles.length >= speakerDeckConfig.maxArticles) {
        break;
      }
      
      // レート制限対策
      await this.delay(speakerDeckConfig.requestDelay);
    }

    const finalArticles = articles.slice(0, speakerDeckConfig.maxArticles);
    
    return finalArticles;
  }

  /**
   * 一覧ページから候補を収集（複数カテゴリー対応）
   */
  private async collectCandidates(): Promise<PresentationCandidate[]> {
    const allCandidates = new Map<string, PresentationCandidate>();
    const enabledCategories = speakerDeckConfig.categories.filter(c => c.enabled);
    
    
    for (const category of enabledCategories) {
      const categoryCandidates = await this.collectCandidatesFromCategory(category);
      
      // URL重複を排除しながらMapに追加
      for (const candidate of categoryCandidates) {
        if (!allCandidates.has(candidate.url)) {
          allCandidates.set(candidate.url, {
            ...candidate,
            category: category.name  // カテゴリー情報を追加
          });
        } else if (speakerDeckConfig.debug) {
        }
      }
      
    }
    
    // Views数で降順ソート
    const candidates = Array.from(allCandidates.values());
    candidates.sort((a, b) => b.views - a.views);
    
    
    return candidates;
  }

  /**
   * 特定カテゴリーから候補を収集
   */
  private async collectCandidatesFromCategory(
    category: { name: string; path: string; enabled: boolean; weight: number }
  ): Promise<PresentationCandidate[]> {
    const candidates: PresentationCandidate[] = [];
    let page = 1;
    const maxPerCategory = speakerDeckConfig.maxArticlesPerCategory || 35;

    while (candidates.length < maxPerCategory && page <= speakerDeckConfig.maxPages) {
      
      const listUrl = `https://speakerdeck.com/c/${category.path}?lang=ja&page=${page}`;
      
      if (speakerDeckConfig.debug) {
      }

      try {
        const html = await this.fetchWithRetry(listUrl);
        const $ = cheerio.load(html);
        
        let foundOnPage = 0;
        $('.deck-preview').each((index, element) => {
          const $item = $(element);
          const $link = $item.find('a.deck-preview-link');
          const href = $link.attr('href');
          const title = $link.attr('title') || $link.find('.deck-title').text().trim();
          
          if (!href || !title) return;

          // 日本語チェック
          const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(title);
          if (!hasJapanese) return;

          // Views数を取得
          const viewsElement = $item.find('span[title*="views"]');
          const viewsTitle = viewsElement.attr('title');
          
          if (viewsTitle) {
            const viewsMatch = viewsTitle.match(/([0-9,]+)\s*views/);
            if (viewsMatch) {
              const viewsNumber = parseInt(viewsMatch[1].replace(/,/g, ''));
              
              // Views数フィルタリング
              if (viewsNumber >= speakerDeckConfig.minViews) {
                const author = $item.find('.deck-preview-meta .text-truncate a').text().trim() || 'Unknown';
                
                candidates.push({
                  url: `https://speakerdeck.com${href}`,
                  title: title,
                  author: author,
                  views: viewsNumber
                });
                foundOnPage++;
              }
            }
          }
        });

        if (speakerDeckConfig.debug) {
        }

        // 候補が見つからなくなったら終了
        if (foundOnPage === 0) {
          break;
        }

      } catch (_error) {
        break;
      }

      page++;
      await this.delay(speakerDeckConfig.requestDelay);
    }
    
    return candidates;
  }

  /**
   * プレゼンテーションの詳細情報を取得
   */
  private async fetchPresentationDetails(url: string): Promise<PresentationDetails> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);
    
    // JSON-LDから情報を取得（推奨）
    const jsonLdScript = $('script[type="application/ld+json"]').html();
    if (jsonLdScript) {
      try {
        const data = JSON.parse(jsonLdScript);
        return {
          publishedAt: new Date(data.datePublished || Date.now()),
          description: data.description,
          thumbnail: data.thumbnailUrl
        };
      } catch (_error) {
        if (speakerDeckConfig.debug) {
        }
      }
    }
    
    // フォールバック: HTMLから直接取得
    const dateText = $('.deck-date').text();
    const dateMatch = dateText.match(/(\d{4})\.(\d{2})\.(\d{2})/);
    
    let publishedAt = new Date();
    if (dateMatch) {
      publishedAt = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`);
    }
    
    const description = $('.deck-description').text().trim() || 
                       $('meta[name="description"]').attr('content') || '';
    
    const thumbnail = $('meta[property="og:image"]').attr('content') || '';
    
    return {
      publishedAt,
      description,
      thumbnail
    };
  }

  /**
   * リトライ機能付きフェッチ
   */
  private async fetchWithRetry(url: string, retries = 0): Promise<string> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), speakerDeckConfig.timeout);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.text();
    } catch (_error) {
      if (retries < speakerDeckConfig.retryLimit) {
        const waitTime = speakerDeckConfig.requestDelay * (retries + 1);
        if (speakerDeckConfig.debug) {
        }
        await this.delay(waitTime);
        return this.fetchWithRetry(url, retries + 1);
      }
      throw error;
    }
  }

  /**
   * 遅延処理
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 配列をチャンクに分割
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * タグ抽出（既存のメソッドを維持）
   */
  private extractTags(text: string): string[] {
    const tags: string[] = [];
    
    // 技術キーワードを抽出
    const techKeywords = [
      'Ruby', 'Rails', 'Python', 'JavaScript', 'TypeScript', 'React', 'Vue', 'Next.js',
      'Node.js', 'Go', 'Rust', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure',
      'DevOps', 'CI/CD', 'microservices', 'serverless', 'API', 'GraphQL',
      'machine learning', 'AI', 'データ分析', 'セキュリティ', 'パフォーマンス',
      'アーキテクチャ', 'データベース', 'MySQL', 'PostgreSQL', 'Redis',
      'Elasticsearch', 'monitoring', 'observability', 'SRE', 'infrastructure'
    ];

    for (const keyword of techKeywords) {
      if (text.toLowerCase().includes(keyword.toLowerCase())) {
        tags.push(keyword);
      }
    }

    // 日本語の技術キーワード
    const japaneseKeywords = [
      'フロントエンド', 'バックエンド', 'インフラ', 'クラウド', '機械学習',
      'ディープラーニング', 'ブロックチェーン', 'マイクロサービス', 
      'コンテナ', '仮想化', 'テスト', '自動化', '最適化', '設計', '実装'
    ];

    for (const keyword of japaneseKeywords) {
      if (text.includes(keyword)) {
        tags.push(keyword);
      }
    }

    return [...new Set(tags)].slice(0, 5); // 重複を除いて最大5個
  }
}
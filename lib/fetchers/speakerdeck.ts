import { Source } from '@prisma/client';
import { BaseFetcher } from './base';
import RSSParser from 'rss-parser';
import type { CreateArticleInput } from '@/lib/types/article';
import { fetcherConfig } from '@/lib/config/fetchers';
import * as cheerio from 'cheerio';

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

    // まずトレンドページから記事を取得
    try {
      const trendingArticles = await this.fetchTrendingPresentations();
      articles.push(...trendingArticles);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('❌ Speaker Deck トレンド取得エラー:', err.message);
      errors.push(err);
    }

    // 日本語技術系プレゼンテーションを見つけやすいユーザーのRSSフィード
    const techSpeakers = [
      'twada', // TDD/テスト駆動開発
      'willnet', // Ruby/Rails関連
      'yosuke_furukawa', // Node.js/JavaScript
      'mizchi', // フロントエンド技術
      'makoga', // インフラ/クラウド
      'kenjiskywalker', // DevOps/SRE
      'matsumoto_r', // Web技術/パフォーマンス
      'kazuho', // HTTP/Web標準
      'sorah', // Ruby/インフラ
      'tagomoris', // データ処理/分散システム
      'kentaro', // Perl/Web開発
      'hsbt', // Ruby/RubyGems
      'kokukuma', // SRE/監視
      'tcnksm', // Go/Docker
      'kurotaky', // Rails/Web開発
      'onk', // Ruby/Rails
      'voluntas', // WebRTC/リアルタイム通信
      'moznion', // Perl/Go
      'tokuhirom', // Perl/Web開発
      'gfx', // JavaScript/TypeScript
      'cho45', // JavaScript/電子工作
      'hakobe', // Web開発/スタートアップ
      'yuki24', // Rails/API設計
      'joker1007', // Ruby/データ処理
      'k0kubun', // Ruby/JITコンパイラ
      'azu', // JavaScript/Web標準
    ];

    // 各スピーカーのRSSフィードを取得
    for (const speaker of techSpeakers) {
      try {
        const feedUrl = `https://speakerdeck.com/${speaker}.rss`;
        console.log(`📥 Speaker Deck: ${speaker} のフィードを取得中...`);
        
        const feed = await this.parser.parseURL(feedUrl);
        
        for (const item of feed.items.slice(0, 3)) { // 各スピーカーから最新3件
          if (!item.link || !item.title) continue;

          // 日本語のプレゼンテーションかどうかチェック
          const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(item.title);
          if (!hasJapanese) continue;

          const article: CreateArticleInput = {
            title: item.title,
            url: item.link,
            sourceId: this.source.id,
            content: item.contentSnippet || item.content || '',
            description: item.contentSnippet || '',
            publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
            author: speaker,
            tags: this.extractTags(item.title + ' ' + (item.contentSnippet || '')),
          };

          articles.push(article);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`❌ Speaker Deck ${speaker} エラー:`, err.message);
        errors.push(err);
      }
    }

    console.log(`✅ Speaker Deck: ${articles.length}件のプレゼンテーションを取得`);
    return { articles, errors };
  }

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

  private async fetchTrendingPresentations(): Promise<CreateArticleInput[]> {
    const articles: CreateArticleInput[] = [];
    const url = 'https://speakerdeck.com/c/programming?lang=ja';
    
    console.log('📥 Speaker Deck: トレンドページを取得中...');
    
    try {
      // フェッチ処理
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // プレゼンテーションアイテムを取得
      $('a.deck-preview-link').each((index, element) => {
        if (index >= 30) return; // 日別トレンド上位30件
        
        const $link = $(element);
        const href = $link.attr('href');
        const title = $link.attr('title') || $link.find('.deck-title').text().trim();
        
        if (!href || !title) return;

        // 日本語のプレゼンテーションかチェック
        const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(title);
        if (!hasJapanese) return;

        // 著者情報を取得（メタデータから）
        const $meta = $link.next('.deck-preview-meta');
        const author = $meta.find('.text-truncate').first().text().trim();
        
        // 現在の日付を使用（トレンドページには日付情報がない）
        const publishedAt = new Date();

        const article: CreateArticleInput = {
          title: title,
          url: `https://speakerdeck.com${href}`,
          sourceId: this.source.id,
          content: title,
          description: title,
          publishedAt: publishedAt,
          author: author || 'Unknown',
          tags: this.extractTags(title),
        };

        articles.push(article);
      });

      console.log(`✅ Speaker Deck: トレンドから${articles.length}件のプレゼンテーションを取得`);
    } catch (error) {
      console.error('❌ Speaker Deck トレンドページ取得エラー:', error);
      throw error;
    }

    return articles;
  }
}
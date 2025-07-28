import Parser from 'rss-parser';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/lib/types/article';
import { parseRSSDate } from '@/lib/utils/date';

interface HatenaItem {
  title?: string;
  link?: string;
  pubDate?: string;
  'dc:date'?: string;
  description?: string;
  content?: string;
  contentSnippet?: string;
  'hatena:bookmarkcount'?: string;
  categories?: string[];
}

export class HatenaExtendedFetcher extends BaseFetcher {
  private parser: Parser<any, HatenaItem>;
  
  // 技術系のRSSフィードのみを使用
  private rssUrls = [
    'https://b.hatena.ne.jp/hotentry/it.rss',           // ITカテゴリー人気
    'https://b.hatena.ne.jp/entrylist/it.rss',          // ITカテゴリー新着
    'https://b.hatena.ne.jp/hotentry/it.rss?mode=rss&sort=hot',  // ITカテゴリーホット
  ];

  // 技術系キーワード（フィルタリング用）
  private techKeywords = [
    // プログラミング言語
    'javascript', 'typescript', 'python', 'java', 'ruby', 'go', 'rust', 'php', 'swift', 'kotlin',
    'c++', 'c#', 'scala', 'elixir', 'haskell', 'clojure', 'dart', 'julia', 'r言語',
    
    // フレームワーク・ライブラリ
    'react', 'vue', 'angular', 'next.js', 'nuxt', 'svelte', 'node.js', 'express', 'django',
    'rails', 'spring', 'laravel', 'flask', 'fastapi', 'gin', 'echo',
    
    // インフラ・クラウド
    'aws', 'gcp', 'azure', 'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins',
    'github', 'gitlab', 'circleci', 'cloudflare', 'vercel', 'netlify',
    
    // データベース
    'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch', 'dynamodb', 'firestore',
    'sqlite', 'prisma', 'typeorm', 'sequelize',
    
    // AI・機械学習
    'ai', '機械学習', 'ディープラーニング', 'chatgpt', 'gpt', 'llm', 'tensorflow',
    'pytorch', 'scikit-learn', 'pandas', 'numpy', 'jupyter',
    
    // その他技術用語
    'api', 'rest', 'graphql', 'websocket', 'oauth', 'jwt', 'ci/cd', 'devops',
    'マイクロサービス', 'サーバーレス', 'sre', 'セキュリティ', 'linux', 'ubuntu',
    'git', 'vim', 'vscode', 'プログラミング', '開発', 'エンジニア', 'コーディング',
    'アルゴリズム', 'データ構造', 'デザインパターン', 'リファクタリング', 'テスト',
    'フロントエンド', 'バックエンド', 'フルスタック', 'web開発', 'アプリ開発',
    'オープンソース', 'oss', 'npm', 'yarn', 'pip', 'gem', 'cargo'
  ];

  constructor(source: any) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: [
          ['dc:date', 'dcDate'],
          ['hatena:bookmarkcount', 'bookmarkcount'],
        ],
      },
    });
  }

  async fetch(): Promise<FetchResult> {
    const allArticles: CreateArticleInput[] = [];
    const allErrors: Error[] = [];
    const seenUrls = new Set<string>();

    // 各RSSフィードから記事を取得
    for (const rssUrl of this.rssUrls) {
      try {
        const feed = await this.retry(() => this.parser.parseURL(rssUrl));
        
        for (const item of feed.items || []) {
          try {
            if (!item.title || !item.link) continue;
            
            // 重複チェック
            if (seenUrls.has(item.link)) continue;
            
            const article: CreateArticleInput = {
              title: this.sanitizeText(item.title),
              url: this.normalizeUrl(item.link),
              summary: undefined, // 要約は後で日本語で生成
              content: item.content || item.description || item.contentSnippet || '',
              publishedAt: item.pubDate ? parseRSSDate(item.pubDate) : 
                          item['dc:date'] ? new Date(item['dc:date']) : new Date(),
              sourceId: this.source.id,
              tagNames: item.categories || [],
              bookmarks: item['hatena:bookmarkcount'] ? parseInt(item['hatena:bookmarkcount'], 10) : 0,
            };

            // 技術記事かチェック + 品質フィルタリング
            if (this.isTechArticle(article) && (article.bookmarks || 0) >= 50) {
              seenUrls.add(item.link);
              allArticles.push(article);
            }
          } catch (error) {
            allErrors.push(new Error(`Failed to parse item: ${error instanceof Error ? error.message : String(error)}`));
          }
        }

        // レート制限を考慮して少し待機
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        allErrors.push(new Error(`Failed to fetch from ${rssUrl}: ${error instanceof Error ? error.message : String(error)}`));
      }
    }

    // ブックマーク数でソートして上位30件を返す（品質重視）
    allArticles.sort((a, b) => (b.bookmarks || 0) - (a.bookmarks || 0));

    // 100users以上の記事を優先
    const highQualityArticles = allArticles.filter(a => (a.bookmarks || 0) >= 100);
    const mediumQualityArticles = allArticles.filter(a => (a.bookmarks || 0) >= 50 && (a.bookmarks || 0) < 100);
    
    const finalArticles = [
      ...highQualityArticles,
      ...mediumQualityArticles.slice(0, Math.max(0, 30 - highQualityArticles.length))
    ];

    return { 
      articles: finalArticles.slice(0, 30), // 品質の高い記事30件
      errors: allErrors 
    };
  }

  private isTechArticle(article: CreateArticleInput): boolean {
    // タイトルと要約を小文字に変換
    const titleLower = article.title.toLowerCase();
    const summaryLower = (article.summary || '').toLowerCase();
    const contentLower = (article.content || '').toLowerCase().slice(0, 1000); // 最初の1000文字のみチェック
    
    // 技術キーワードのいずれかが含まれているかチェック
    return this.techKeywords.some(keyword => {
      const keywordLower = keyword.toLowerCase();
      return titleLower.includes(keywordLower) || 
             summaryLower.includes(keywordLower) ||
             contentLower.includes(keywordLower);
    });
  }
}